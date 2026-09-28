"""Session management with SQLite persistence and Anthropic LLM."""

from __future__ import annotations

import logging
import random
import uuid
from datetime import datetime, timezone

import aiosqlite

from .database import (
    create_session as db_create_session,
    get_due_words,
    get_review_candidates,
    get_session as db_get_session,
    get_user,
    get_vocab_progress,
    get_weak_words,
    get_weakest_concepts,
    list_sessions,
    record_concept_result,
    update_session as db_update_session,
    upsert_vocab_progress,
)
from .composition import (
    build_exclusion_list,
    build_focus_block,
    build_vocab_plan,
    filter_translation_items,
    normalize_word,
    partition_seen_questions,
    question_defect,
    resolve_topic_label,
)
from .llm import LLMError, ask, ask_json, ask_messages
from .prompts import (
    CONVERSATION_TURN_PROMPT,
    ERROR_CORRECTION_BATCH_PROMPT,
    FEEDBACK_PROMPT,
    FILL_BLANK_BATCH_PROMPT,
    GRAMMAR_LESSON_PROMPT,
    HINT_PROMPT,
    TRANSLATION_BATCH_PROMPT,
    TRANSLATION_EVALUATE_PROMPT,
    VOCAB_BATCH_PROMPT,
)
from .questions import QUESTIONS, TOPICS
from .scoring import compute_category_scores, compute_session_score, grade_answer, normalize_answer
from .schemas import (
    FEEDBACK_SCHEMA,
    GRAMMAR_LESSON_SCHEMA,
    TRANSLATION_BATCH_SCHEMA,
    TRANSLATION_GRADE_SCHEMA,
    VOCAB_BATCH_SCHEMA,
)
from .vocab_extraction import extract_vocab_from_session, question_pair

log = logging.getLogger(__name__)

DIFFICULTY_LABELS = {
    "beginner": "beginner (A1-A2)",
    "intermediate": "intermediate (B1-B2)",
    "advanced": "advanced (C1-C2)",
}

# Translation topic -> (exercise kind, fixed direction or None for both)
TRANSLATION_KINDS: dict[str, tuple[str, str | None]] = {
    "english_to_slovak": ("translate", "en-sk"),
    "slovak_to_english": ("translate", "sk-en"),
    "fill_in_blanks": ("fill_blank", "en-sk"),
    "error_correction": ("error_correction", "en-sk"),
}

_TRANSLATION_PROMPTS: dict[str, str] = {
    "translate": TRANSLATION_BATCH_PROMPT,
    "fill_blank": FILL_BLANK_BATCH_PROMPT,
    "error_correction": ERROR_CORRECTION_BATCH_PROMPT,
}

_TRANSLATION_NOUNS: dict[str, str] = {
    "translate": "translation exercises",
    "fill_blank": "fill-in-the-blank exercises",
    "error_correction": "error-correction exercises",
}

_GRADER_TASKS: dict[str, str] = {
    "translate": "Evaluate the student's translation.",
    "fill_blank": (
        "The student filled the blank in the Slovak sentence. Decide whether their "
        "word is correct in this sentence. A different word that is also correct "
        "and natural here earns full marks."
    ),
    "error_correction": (
        "The source sentence contains one deliberate mistake. The student rewrote "
        "it. Decide whether their sentence fixes the mistake and is correct Slovak."
    ),
}


# ── Learning Context ────────────────────────────────────────────────


async def _get_learning_context(
    db: aiosqlite.Connection, user_id: str, mode: str, *, include_vocab: bool = True,
) -> str:
    """Build a distilled learning context string to inject into LLM prompts.

    Combines vocabulary progress and recent session history.
    Kept under ~500 tokens to avoid prompt bloat.
    """
    sections: list[str] = []

    all_sessions = await list_sessions(db, user_id)
    completed_sessions = [s for s in all_sessions if s["completed"]]

    # ── 1. Vocabulary progress summary ──
    all_vocab = await get_vocab_progress(db, user_id)
    if include_vocab and all_vocab:
        total = len(all_vocab)
        weak = await get_weak_words(db, user_id, limit=8)
        weak_words = [
            f"{w['slovak']} ({w['english']})" if w.get("english") else w["slovak"]
            for w in weak
        ]

        # Topics covered: derive from completed sessions
        topic_counts: dict[str, int] = {}
        for s in completed_sessions:
            topic_label = TOPICS.get(s["mode"], {}).get(s["topic"], s["topic"])
            topic_counts[topic_label] = topic_counts.get(topic_label, 0) + 1

        top_topics = sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)[:5]

        vocab_section = f"Total unique words practiced: {total}"
        if top_topics:
            topic_strs = [f"{t} ({c} sessions)" for t, c in top_topics]
            vocab_section += f"\nPreviously covered topics: {', '.join(topic_strs)}"
        if weak_words:
            vocab_section += f"\nWords the student struggles with: {', '.join(weak_words[:8])}"

        # Recent words from last 2 completed sessions
        recent_completed = [s for s in completed_sessions[:2] if s.get("feedback")]
        recent_words: list[str] = []
        for s in recent_completed:
            for v in s["feedback"].get("vocabulary_learned", [])[:5]:
                w = v.get("slovak", "")
                if w:
                    recent_words.append(w)
        if recent_words:
            vocab_section += f"\nRecently learned words: {', '.join(recent_words[:10])}"

        sections.append(f"[Student's vocabulary progress]\n{vocab_section}")

    # ── 2. Recent session history digest (last 3 for this mode) ──
    mode_sessions = [
        s for s in completed_sessions
        if s["mode"] == mode and s.get("feedback")
    ][:3]

    if mode_sessions:
        digest_parts: list[str] = []
        for s in mode_sessions:
            fb = s["feedback"]
            topic_label = TOPICS.get(s["mode"], {}).get(s["topic"], s["topic"])
            score = fb.get("overall_score", "?")
            strengths = fb.get("strengths", [])[:1]
            improvements = fb.get("improvements", [])[:1]
            part = f"- {topic_label} (score: {score}/10)"
            if strengths:
                part += f" | Strength: {strengths[0]}"
            if improvements:
                part += f" | To improve: {improvements[0]}"
            digest_parts.append(part)

        grammar_notes_all: list[str] = []
        for s in mode_sessions:
            grammar_notes_all.extend(s["feedback"].get("grammar_notes", [])[:2])
        if grammar_notes_all:
            digest_parts.append(f"Grammar concepts covered: {', '.join(grammar_notes_all[:4])}")

        sections.append(f"[Recent {mode} session history]\n" + "\n".join(digest_parts))

    if not sections:
        return ""

    return "\n\n".join(sections)


# ── Session Creation ─────────────────────────────────────────────────

async def create_session(db: aiosqlite.Connection, req: dict) -> dict:
    """Create a new session, dispatching to mode-specific creators."""
    mode = req["mode"]
    creators = {
        "vocabulary": _create_vocab_session,
        "grammar": _create_grammar_session,
        "translation": _create_translation_session,
        "conversation": _create_conversation_session,
    }
    creator = creators.get(mode)
    if not creator:
        raise ValueError(f"Unknown mode: {mode}")
    return await creator(db, req)


async def _create_vocab_session(db: aiosqlite.Connection, req: dict) -> dict:
    topic_label = resolve_topic_label("vocabulary", req.get("topic"))
    difficulty = req.get("difficulty", "beginner")
    difficulty_label = DIFFICULTY_LABELS.get(difficulty, difficulty)
    instructions = (req.get("instructions") or "").strip()
    include_review = bool(req.get("include_review"))
    focus = build_focus_block(topic_label, instructions)

    due = await get_review_candidates(db, req["user_id"], limit=8) if include_review else []
    plan = build_vocab_plan(due, total=10, include_review=include_review)
    plan_words = plan["review"]
    all_vocab = await get_vocab_progress(db, req["user_id"])
    exclusions = build_exclusion_list(all_vocab, plan_words)

    prompt = f"Student level: {difficulty_label}\n\n{focus}\n"
    if plan_words:
        listed = ", ".join(f"{w['slovak']} ({w['english']})" for w in plan_words)
        prompt += (
            "\nREQUIRED REVIEW WORDS — these are due for review; create one question "
            f"for each of these exact Slovak words, whatever the session focus: {listed}\n"
        )
    prompt += (
        f"\nAdd {plan['new_count']} NEW vocabulary questions. "
        "Every new word fits the session focus."
    )
    if exclusions:
        prompt += (
            "\n\nThe student has already seen these words. Do not use any of them "
            "for the new questions: " + ", ".join(exclusions)
        )

    data = await ask_json(
        prompt, VOCAB_BATCH_PROMPT,
        schema=VOCAB_BATCH_SCHEMA, schema_name="vocab_batch",
        effort="medium", max_tokens=16000,
    )
    questions, spare = _split_vocab_questions(
        data.get("questions", []), plan_words, exclusions
    )

    if len(questions) < 10:
        missing = 10 - len(questions)
        seen_norm: set[str] = set()
        used_words: list[str] = []
        for w in list({q["word"] for q in questions}) + list(exclusions):
            nw = normalize_word(w)
            if nw not in seen_norm:
                seen_norm.add(nw)
                used_words.append(w)
        used = ", ".join(sorted(used_words))
        retry_prompt = (
            f"Student level: {difficulty_label}\n\n{focus}\n\n"
            f"Generate exactly {missing} vocabulary quiz questions that fit the "
            f"session focus. Do NOT use any of these words: {used}"
        )
        more = await ask_json(
            retry_prompt, VOCAB_BATCH_PROMPT,
            schema=VOCAB_BATCH_SCHEMA, schema_name="vocab_batch",
            effort="medium", max_tokens=16000,
        )
        questions, more_spare = _split_vocab_questions(
            questions + more.get("questions", []), plan_words, exclusions
        )
        # A focus the learner has used up (a closed set such as the days of
        # the week) has no new words left; seen words on the focus fill in.
        questions = _fill_with_seen(questions, spare + more_spare, total=10)

    if len(questions) < 6:
        raise LLMError("Vocabulary generation produced too few valid questions")

    if len(questions) < 10:
        log.warning("Vocab session generated %d/10 questions for user %s", len(questions), req["user_id"])

    questions = questions[:10]

    exercises = {
        "type": "vocabulary",
        "questions": questions,
        "currentIndex": 0,
        "answers": [None] * len(questions),
        "credits": [None] * len(questions),
        "retryQueue": [],
        "phase": "questions",
        "srsPerAnswer": True,
    }

    session = _build_session(req, exercises=exercises)
    await db_create_session(db, session)
    return session


def _validate_vocab_questions(
    questions: list[dict], plan_words: list[dict], exclusions: list[str],
) -> list[dict]:
    """Drop defective, excluded and duplicate questions; flag the review ones."""
    return _split_vocab_questions(questions, plan_words, exclusions)[0]


def _split_vocab_questions(
    questions: list[dict], plan_words: list[dict], exclusions: list[str],
) -> tuple[list[dict], list[dict]]:
    """(valid questions, questions set aside only because their word was seen).

    The set-aside questions are not yet checked for defects or duplicates;
    _fill_with_seen does that when it uses them.
    """
    plan_keys: set[str] = set()
    for w in plan_words:
        plan_keys.add(normalize_word(w["slovak"]))
        if w.get("english"):
            plan_keys.add(normalize_word(w["english"]))

    candidates, seen = partition_seen_questions(questions, plan_words, exclusions)
    taken: set[str] = set()
    valid: list[dict] = []
    for q in candidates:
        keys = _usable_question_keys(q, taken)
        if keys is None:
            continue
        taken |= keys
        q["review"] = bool(keys & plan_keys)
        valid.append(q)
    return valid, seen


def _fill_with_seen(questions: list[dict], seen: list[dict], total: int) -> list[dict]:
    """Top up a short lesson with usable seen-word questions, flagged as review."""
    taken: set[str] = set()
    for q in questions:
        taken |= _question_keys(q)
    filled = list(questions)
    for q in seen:
        if len(filled) >= total:
            break
        keys = _usable_question_keys(q, taken)
        if keys is None:
            continue
        taken |= keys
        filled.append({**q, "review": True})
    return filled


def _question_keys(q: dict) -> set[str]:
    # Both the display word and the correct answer, so the same pair can't
    # appear twice via opposite directions (mäso→meat, meat→mäso).
    return {normalize_word(q["word"]), normalize_word(q["choices"][q["correctIndex"]])}


def _usable_question_keys(q: dict, taken: set[str]) -> set[str] | None:
    """The question's dedupe keys, or None when it is defective or a duplicate."""
    defect = question_defect(q)
    if defect:
        log.info("Dropping vocab question %r: %s", q.get("word"), defect)
        return None
    keys = _question_keys(q)
    if keys & taken:
        return None
    lower_choices = [c.strip().lower() for c in q["choices"]]
    if len(set(lower_choices)) < len(lower_choices):
        return None
    return keys


async def _create_grammar_session(db: aiosqlite.Connection, req: dict) -> dict:
    topic_label = resolve_topic_label("grammar", req.get("topic"))
    difficulty = req.get("difficulty", "beginner")
    difficulty_label = DIFFICULTY_LABELS.get(difficulty, difficulty)
    instructions = (req.get("instructions") or "").strip()

    target_concept = None
    if req.get("topic", "general") == "general":
        weakest = await get_weakest_concepts(db, req["user_id"], limit=1)
        if weakest and weakest[0]["accuracy"] < 0.7:
            target_concept = weakest[0]["concept"]
    learning_context = await _get_learning_context(db, req["user_id"], "grammar")

    all_sessions = await list_sessions(db, req["user_id"])
    recent_concepts: list[str] = []
    for s in all_sessions:
        if s["mode"] == "grammar" and s["completed"]:
            concept = ((s.get("exercises") or {}).get("lesson") or {}).get("concept")
            if concept and concept not in recent_concepts:
                recent_concepts.append(concept)
        if len(recent_concepts) >= 5:
            break

    prompt = (
        f"Student level: {difficulty_label}\n\n"
        f"{build_focus_block(topic_label, instructions)}\n"
    )
    if learning_context:
        prompt += f"\n{learning_context}\n"
    prompt += (
        "\nCreate a grammar lesson and exercises that fit the session focus. "
        "Build on concepts the student has already covered."
    )
    if recent_concepts:
        prompt += (
            "\n\nRecently covered concepts: " + ", ".join(recent_concepts) + ". "
            "Teach a different concept or a deeper aspect, unless a TARGET CONCEPT "
            "is set or the student's instructions ask otherwise."
        )
    if target_concept:
        prompt += (
            f"\n\nTARGET CONCEPT: The student's weakest concept is '{target_concept}' "
            f"— build this lesson on that concept unless the student's instructions "
            f"request a different one."
        )

    data = await ask_json(
        prompt, GRAMMAR_LESSON_PROMPT,
        schema=GRAMMAR_LESSON_SCHEMA, schema_name="grammar_lesson",
        effort="medium", max_tokens=16000,
    )

    lesson = data.get("lesson", {})
    exercise_list = data.get("exercises", [])

    exercises = {
        "type": "grammar",
        "lesson": {
            "concept": lesson.get("concept") or topic_label or "Grammar",
            "explanation": lesson.get("explanation", ""),
            "examples": lesson.get("examples", []),
            "table": lesson.get("table"),
        },
        "exercises": [
            {
                "sentence": ex.get("sentence", ""),
                "blank": ex.get("blank", ""),
                "hint": ex.get("hint"),
                "explanation": ex.get("explanation", ""),
                **({"choices": ex["choices"]} if ex.get("choices") else {}),
            }
            for ex in exercise_list
        ],
        "currentIndex": 0,
        "answers": [None] * len(exercise_list),
        "correct": [None] * len(exercise_list),
        "credits": [None] * len(exercise_list),
        "tiers": [None] * len(exercise_list),
        "phase": "lesson",
    }

    session = _build_session(req, exercises=exercises)
    await db_create_session(db, session)
    return session


async def _recent_translation_sources(
    db: aiosqlite.Connection, user_id: str, sessions_back: int = 10, cap: int = 60,
) -> list[str]:
    """Source sentences from the learner's latest translation sessions."""
    sources: list[str] = []
    counted = 0
    for s in await list_sessions(db, user_id):
        if s["mode"] != "translation":
            continue
        counted += 1
        for item in (s.get("exercises") or {}).get("exercises", []):
            if item.get("source"):
                sources.append(item["source"])
        if counted >= sessions_back:
            break
    return sources[:cap]


async def _create_translation_session(db: aiosqlite.Connection, req: dict) -> dict:
    kind, direction = TRANSLATION_KINDS.get(req.get("topic") or "", ("translate", None))
    difficulty = req.get("difficulty", "beginner")
    difficulty_label = DIFFICULTY_LABELS.get(difficulty, difficulty)
    instructions = (req.get("instructions") or "").strip()
    include_review = bool(req.get("include_review"))
    system_prompt = _TRANSLATION_PROMPTS[kind]
    noun = _TRANSLATION_NOUNS[kind]

    # The topic chip chooses the exercise kind, so the theme comes from the
    # learner's instructions alone.
    focus = build_focus_block(None, instructions)
    learning_context = await _get_learning_context(
        db, req["user_id"], "translation", include_vocab=False,
    )
    review_words = await get_due_words(db, req["user_id"], limit=6) if include_review else []
    recent_sources = await _recent_translation_sources(db, req["user_id"])

    def build_prompt(count: int, avoid: list[str]) -> str:
        prompt = f"Student level: {difficulty_label}\n\n{focus}\n"
        if learning_context:
            prompt += f"\n{learning_context}\n"
        prompt += f"\nGenerate {count} {noun} that fit the session focus."
        if kind == "translate" and direction:
            prompt += f' Every exercise uses direction "{direction}".'
        if review_words:
            listed = ", ".join(
                f"{w['slovak']} ({w['english']})" if w.get("english") else w["slovak"]
                for w in review_words
            )
            prompt += (
                "\n\nWeave these review words into the sentences where natural "
                f"(the student asked to review them): {listed}"
            )
        if avoid:
            prompt += (
                "\n\nThese sentences were used recently. Do not reuse them or "
                "lightly reworded versions of them:\n- " + "\n- ".join(avoid)
            )
        return prompt

    data = await ask_json(
        build_prompt(10, recent_sources), system_prompt,
        schema=TRANSLATION_BATCH_SCHEMA, schema_name="translation_batch",
        effort="medium", max_tokens=16000,
    )
    items = filter_translation_items(
        data.get("exercises", []), kind, direction, recent_sources,
    )

    if len(items) < 10:
        used = recent_sources + [i["source"] for i in items]
        more = await ask_json(
            build_prompt(10 - len(items), used), system_prompt,
            schema=TRANSLATION_BATCH_SCHEMA, schema_name="translation_batch",
            effort="medium", max_tokens=16000,
        )
        items += filter_translation_items(more.get("exercises", []), kind, direction, used)

    if len(items) < 6:
        raise LLMError("Translation generation produced too few valid exercises")
    if len(items) < 10:
        log.warning(
            "Translation session generated %d/10 exercises for user %s",
            len(items), req["user_id"],
        )
    items = items[:10]

    exercises = {
        "type": "translation",
        "exercises": items,
        "currentIndex": 0,
        "answers": [None] * len(items),
        "phase": "exercises",
    }

    session = _build_session(req, exercises=exercises)
    await db_create_session(db, session)
    return session


async def _create_conversation_session(db: aiosqlite.Connection, req: dict) -> dict:
    topic = req.get("topic", "general")
    difficulty = req.get("difficulty", "beginner")
    difficulty_label = DIFFICULTY_LABELS.get(difficulty, difficulty)

    instructions = (req.get("instructions") or "").strip()
    learning_context = await _get_learning_context(db, req["user_id"], "conversation")

    mode_questions = QUESTIONS.get("conversation", {})
    topic_questions = mode_questions.get(topic, [])

    if topic_questions:
        question = random.choice(topic_questions)
    elif topic in ("", "general"):
        question = "Let's have a friendly get-to-know-you chat."
    else:
        question = f"Let's have a conversation about {topic.replace('_', ' ')}."

    topic_label = resolve_topic_label("conversation", topic)
    user = await get_user(db, req["user_id"])
    student_name = user["name"] if user else "Student"

    prompt = (
        f"The student's name is {student_name} and they are at {difficulty_label} level.\n\n"
        f"{build_focus_block(topic_label, instructions)}\n"
    )
    if learning_context:
        prompt += f"\n{learning_context}\n"
    prompt += (
        f"\nStart the conversation with this scenario: {question}\n"
        "If the scenario and the session focus conflict, follow the session focus.\n\n"
        f"Begin now — greet {student_name} and start the conversation. "
        f"Remember: ONLY 2-3 sentences maximum for your first message."
    )

    messages = [{"role": "user", "content": prompt}]
    response = await ask_messages(
        messages, CONVERSATION_TURN_PROMPT, max_tokens=4000, effort="low",
    )

    exercises = {
        "type": "conversation",
        "scenario": question,
        "exchangeCount": 0,
        "maxExchanges": 10,
        "phase": "active",
    }

    messages = [{"role": "tutor", "content": response}]
    session = _build_session(req, exercises=exercises, messages=messages)
    await db_create_session(db, session)
    return session


# ── Answer Submission ────────────────────────────────────────────────

async def submit_vocab_answer(db: aiosqlite.Connection, session_id: str, choice_index: int) -> dict:
    session = await db_get_session(db, session_id)
    if not session:
        raise ValueError("Session not found")

    ex = session["exercises"]
    if ex["phase"] == "complete":
        raise ValueError("Session exercises already complete")

    idx = ex["currentIndex"]
    questions = ex["questions"]

    if idx >= len(questions):
        raise ValueError("No more questions")

    q = questions[idx]
    if not (0 <= choice_index < len(q["choices"])):
        raise ValueError(f"choice_index out of range: {choice_index}")
    is_correct = choice_index == q["correctIndex"]
    first_attempt = ex["phase"] == "questions"
    ex["answers"][idx] = choice_index
    credits = ex.setdefault("credits", [None] * len(questions))
    if ex["phase"] == "questions":
        credits[idx] = 1.0 if is_correct else 0.0
    elif ex["phase"] == "retry" and is_correct and credits[idx] == 0.0:
        credits[idx] = 0.5  # recovered on retry

    # Track wrong answers for retry
    if not is_correct and ex["phase"] == "questions":
        ex["retryQueue"].append(idx)

    # Add synthetic message for transcript
    chosen = q["choices"][choice_index] if choice_index < len(q["choices"]) else "?"
    correct_answer = q["choices"][q["correctIndex"]]
    session["messages"].append({
        "role": "student",
        "content": f"Answer: {chosen} ({'correct' if is_correct else f'incorrect, correct: {correct_answer}'})"
    })

    # Advance
    if ex["phase"] == "questions":
        if idx + 1 < len(questions):
            ex["currentIndex"] = idx + 1
        else:
            # Check if retry needed
            if ex["retryQueue"]:
                ex["phase"] = "retry"
                ex["currentIndex"] = ex["retryQueue"][0]
            else:
                ex["phase"] = "complete"
    elif ex["phase"] == "retry":
        # Remove from retry queue on correct; on wrong, rotate the queue so
        # one stubborn word can't block the rest of the retries forever.
        queue = ex["retryQueue"]
        if is_correct and idx in queue:
            queue.remove(idx)
        elif not is_correct and len(queue) > 1 and queue[0] == idx:
            queue.append(queue.pop(0))
        if queue:
            ex["currentIndex"] = queue[0]
        else:
            ex["phase"] = "complete"

    await db_update_session(
        db, session_id,
        exercises_json=ex,
        messages_json=session["messages"],
    )
    if first_attempt and ex.get("srsPerAnswer"):
        slovak, english = question_pair(q)
        try:
            await upsert_vocab_progress(db, session["user_id"], [{
                "slovak": slovak,
                "english": english,
                "correct": is_correct,
                "source_mode": "vocabulary",
            }])
        except Exception:
            log.exception("Failed to save progress for %r in session %s", slovak, session_id)
    session["exercises"] = ex
    return session


async def advance_grammar_phase(db: aiosqlite.Connection, session_id: str) -> dict:
    session = await db_get_session(db, session_id)
    if not session:
        raise ValueError("Session not found")

    ex = session["exercises"]
    if ex["phase"] == "lesson":
        ex["phase"] = "exercises"
        ex["currentIndex"] = 0
        await db_update_session(db, session_id, exercises_json=ex)
    session["exercises"] = ex
    return session


async def submit_grammar_answer(db: aiosqlite.Connection, session_id: str, answer: str) -> dict:
    session = await db_get_session(db, session_id)
    if not session:
        raise ValueError("Session not found")

    ex = session["exercises"]
    if ex["phase"] != "exercises":
        raise ValueError("Not in exercise phase")

    idx = ex["currentIndex"]
    exercises = ex["exercises"]

    if idx >= len(exercises):
        raise ValueError("No more exercises")

    correct_answer = exercises[idx]["blank"]
    grade = grade_answer(correct_answer, answer)
    is_correct = grade.tier in ("exact", "accent")

    ex["answers"][idx] = answer
    ex["correct"][idx] = is_correct
    ex.setdefault("credits", [None] * len(exercises))[idx] = grade.credit
    ex.setdefault("tiers", [None] * len(exercises))[idx] = grade.tier

    # Synthetic message
    if grade.tier == "accent":
        note = f"Answer: {answer} (correct; written with accents: {correct_answer})"
    elif is_correct:
        note = f"Answer: {answer} (correct)"
    else:
        note = f"Answer: {answer} (incorrect, correct: {correct_answer})"
    session["messages"].append({"role": "student", "content": note})

    # Advance
    if idx + 1 < len(exercises):
        ex["currentIndex"] = idx + 1
    else:
        ex["phase"] = "complete"

    await db_update_session(
        db, session_id,
        exercises_json=ex,
        messages_json=session["messages"],
    )
    session["exercises"] = ex
    return session


async def submit_translation(db: aiosqlite.Connection, session_id: str, answer: str) -> dict:
    session = await db_get_session(db, session_id)
    if not session:
        raise ValueError("Session not found")

    ex = session["exercises"]
    if ex["phase"] != "exercises":
        raise ValueError("Not in exercise phase")

    idx = ex["currentIndex"]
    exercises = ex["exercises"]

    if idx >= len(exercises):
        raise ValueError("No more exercises")

    exercise = exercises[idx]

    kind = exercise.get("kind", "translate")
    model_answer = exercise["modelAnswer"]
    grade = grade_answer(model_answer, answer)
    tier: str | None = None

    if grade.tier != "wrong":
        # Same answer once accents, case and punctuation are set aside.
        tier = grade.tier
        score = 10
        feedback = "Correct."
        if tier == "accent":
            feedback += f" With accents: {model_answer}"
    elif kind == "error_correction" and normalize_answer(answer) == normalize_answer(
        exercise["source"]
    ):
        score = 1
        feedback = (
            "The sentence is unchanged, so the mistake is still there. "
            f"Corrected: {model_answer}"
        )
    else:
        eval_prompt = (
            f"Exercise type: {kind}\n"
            f"Source ({exercise['direction']}): {exercise['source']}\n"
        )
        if exercise.get("translation"):
            eval_prompt += f"Intended meaning: {exercise['translation']}\n"
        eval_prompt += (
            f"Model answer: {model_answer}\n"
            f"Student's answer: {answer}\n\n"
            f"{_GRADER_TASKS.get(kind, _GRADER_TASKS['translate'])}"
        )
        eval_data = await ask_json(
            eval_prompt, TRANSLATION_EVALUATE_PROMPT,
            schema=TRANSLATION_GRADE_SCHEMA, schema_name="translation_grade",
            effort="low", max_tokens=4000,
        )
        try:
            score = int(round(float(eval_data.get("score", 5))))
        except (TypeError, ValueError):
            score = 5
        score = max(1, min(10, score))
        feedback = eval_data.get("feedback", "")

    ex["answers"][idx] = {
        "userAnswer": answer,
        "score": score,
        "feedback": feedback,
        "tier": tier,
    }

    session["messages"].append({
        "role": "student",
        "content": f"Translation: {answer}"
    })
    session["messages"].append({
        "role": "tutor",
        "content": f"Score: {score}/10 — {feedback}"
    })

    if idx + 1 < len(exercises):
        ex["currentIndex"] = idx + 1
    else:
        ex["phase"] = "complete"

    await db_update_session(
        db, session_id,
        exercises_json=ex,
        messages_json=session["messages"],
    )
    session["exercises"] = ex
    return session


async def submit_conversation_answer(db: aiosqlite.Connection, session_id: str, answer: str) -> dict:
    session = await db_get_session(db, session_id)
    if not session:
        raise ValueError("Session not found")

    ex = session["exercises"]
    if ex["phase"] != "active":
        raise ValueError("Conversation not active")

    session["messages"].append({"role": "student", "content": answer})
    ex["exchangeCount"] = ex.get("exchangeCount", 0) + 1

    # Build native Anthropic messages from session history
    difficulty_label = DIFFICULTY_LABELS.get(session["difficulty"], session["difficulty"])
    topic_label = resolve_topic_label("conversation", session["topic"])
    scenario = ex.get("scenario", "")

    system_prompt = (
        f"{CONVERSATION_TURN_PROMPT}\n\n"
        f"Student level: {difficulty_label}\n\n"
        f"{build_focus_block(topic_label, ex.get('instructions'))}\n\n"
        f"Scenario: {scenario}\n"
        "If the scenario and the session focus conflict, follow the session focus."
    )

    anthropic_messages: list[dict] = []
    for msg in session["messages"]:
        if msg["role"] == "tutor":
            anthropic_messages.append({"role": "assistant", "content": msg["content"]})
        elif msg["role"] == "student":
            anthropic_messages.append({"role": "user", "content": msg["content"]})
        else:
            # system messages (e.g. hints) included as user context
            anthropic_messages.append({"role": "user", "content": f"[System hint]: {msg['content']}"})

    # Merge consecutive same-role messages (Anthropic requires alternating roles)
    merged: list[dict] = []
    for msg in anthropic_messages:
        if merged and merged[-1]["role"] == msg["role"]:
            merged[-1]["content"] += "\n" + msg["content"]
        else:
            merged.append(msg)

    response = await ask_messages(merged, system_prompt, max_tokens=4000, effort="low")
    session["messages"].append({"role": "tutor", "content": response})

    if ex["exchangeCount"] >= ex["maxExchanges"]:
        ex["phase"] = "complete"

    await db_update_session(
        db, session_id,
        exercises_json=ex,
        messages_json=session["messages"],
    )
    session["exercises"] = ex
    return session


# ── Hint ─────────────────────────────────────────────────────────────

async def get_hint(db: aiosqlite.Connection, session_id: str) -> dict:
    session = await db_get_session(db, session_id)
    if not session:
        raise ValueError("Session not found")

    if session["mode"] == "conversation":
        # Use native messages for conversation mode
        anthropic_messages: list[dict] = []
        for msg in session["messages"]:
            if msg["role"] == "tutor":
                anthropic_messages.append({"role": "assistant", "content": msg["content"]})
            elif msg["role"] == "student":
                anthropic_messages.append({"role": "user", "content": msg["content"]})
            else:
                anthropic_messages.append({"role": "user", "content": f"[System hint]: {msg['content']}"})

        # Merge consecutive same-role messages
        merged: list[dict] = []
        for msg in anthropic_messages:
            if merged and merged[-1]["role"] == msg["role"]:
                merged[-1]["content"] += "\n" + msg["content"]
            else:
                merged.append(msg)

        # Add the hint request as the last user message
        if merged and merged[-1]["role"] == "user":
            merged[-1]["content"] += "\n[The student is stuck and needs a hint.]"
        else:
            merged.append({"role": "user", "content": "[The student is stuck and needs a hint.]"})

        response = await ask_messages(merged, HINT_PROMPT, max_tokens=4000, effort="low")
    else:
        conversation = _build_conversation(session["messages"])
        prompt = f"Conversation so far:\n{conversation}\n\nProvide a helpful hint for the student."
        response = await ask(prompt, HINT_PROMPT, max_tokens=4000, effort="low")

    session["messages"].append({"role": "system", "content": f"\U0001f4a1 {response}"})

    await db_update_session(db, session_id, messages_json=session["messages"])
    return session


# ── End Session ──────────────────────────────────────────────────────

async def _record_deterministic_progress(db: aiosqlite.Connection, session: dict) -> None:
    """Save the progress that needs no model output, once per session."""
    ex = session.get("exercises") or {}
    if not ex or ex.get("progressRecorded"):
        return
    try:
        if ex.get("type") == "vocabulary" and not ex.get("srsPerAnswer"):
            words = extract_vocab_from_session(session)
            if words:
                await upsert_vocab_progress(db, session["user_id"], words)
        if ex.get("type") == "grammar":
            concept = (ex.get("lesson") or {}).get("concept", "")
            credits = [c for c in (ex.get("credits") or []) if c is not None]
            if concept and credits:
                await record_concept_result(db, session["user_id"], concept, credits)
    except Exception:
        # Leave the flag unset so the next attempt records it.
        log.exception("Failed to record progress for session %s", session["id"])
        return
    ex["progressRecorded"] = True
    await db_update_session(db, session["id"], exercises_json=ex)


async def end_session(db: aiosqlite.Connection, session_id: str) -> dict:
    session = await db_get_session(db, session_id)
    if not session:
        raise ValueError("Session not found")

    if session["completed"] and session.get("feedback"):
        return session["feedback"]

    # Before the model call: a failed feedback request must not cost the
    # learner their progress.
    await _record_deterministic_progress(db, session)

    conversation = _build_conversation(session["messages"])
    mode_label = session["mode"].replace("_", " ").title()
    topic_label = resolve_topic_label(session["mode"], session["topic"]) or "no set topic"

    prompt = (
        f"Mode: {mode_label}\n"
        f"Topic: {topic_label}\n"
        f"Difficulty: {session['difficulty']}\n\n"
        f"Full session transcript:\n{conversation}\n\n"
        f"Analyze this session and provide feedback as JSON."
    )

    data = await ask_json(
        prompt, FEEDBACK_PROMPT,
        schema=FEEDBACK_SCHEMA, schema_name="session_feedback",
        effort="low", max_tokens=8000,
    )

    computed_score = compute_session_score(session.get("exercises"))
    computed_categories = compute_category_scores(session.get("exercises"))

    if computed_score is not None:
        overall = computed_score
        scores = computed_categories
    else:
        # Conversation (and legacy/unscorable): LLM decides
        overall = data.get("overall_score", 5)
        scores = [
            {"category": s.get("category", ""), "score": s.get("score", 5), "comment": s.get("comment", "")}
            for s in data.get("scores", [])
        ]

    feedback = {
        "overall_score": overall,
        "scores": scores,
        "strengths": data.get("strengths", []),
        "improvements": data.get("improvements", []),
        "sample_answer": data.get("sample_answer"),
        "vocabulary_learned": [
            {"slovak": v.get("slovak", ""), "english": v.get("english", ""), "example": v.get("example")}
            for v in data.get("vocabulary_learned", [])
        ],
        "grammar_notes": data.get("grammar_notes", []),
    }

    await db_update_session(
        db, session_id,
        completed=True,
        feedback_json=feedback,
    )

    # Words that only the feedback can name. Vocabulary sessions with
    # questions were already recorded from their answers.
    ex = session.get("exercises") or {}
    has_vocab_questions = ex.get("type") == "vocabulary" and bool(ex.get("questions"))
    if not has_vocab_questions:
        try:
            words = extract_vocab_from_session({**session, "feedback": feedback})
            if words:
                await upsert_vocab_progress(db, session["user_id"], words)
                log.info("Tracked %d words for user %s", len(words), session["user_id"])
        except Exception:
            log.exception("Failed to persist vocab progress for session %s", session_id)

    return feedback


# ── Helpers ──────────────────────────────────────────────────────────


def _build_session(req: dict, exercises: dict | None = None, messages: list[dict] | None = None) -> dict:
    instructions = (req.get("instructions") or "").strip()
    if instructions and exercises is not None:
        exercises["instructions"] = instructions
    session = {
        "id": uuid.uuid4().hex[:12],
        "user_id": req["user_id"],
        "mode": req["mode"],
        "topic": req.get("topic", "general"),
        "difficulty": req.get("difficulty", "beginner"),
        "completed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "feedback": None,
        "exercises": exercises,
        "messages": messages or [],
    }
    return session


def _build_conversation(messages: list[dict]) -> str:
    lines = []
    for msg in messages:
        role = msg.get("role", "system")
        label = "Tutor" if role == "tutor" else "Student" if role == "student" else "System"
        lines.append(f"{label}: {msg['content']}")
    return "\n".join(lines)

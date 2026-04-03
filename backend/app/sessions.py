"""Session management with SQLite persistence and Anthropic LLM."""

from __future__ import annotations

import logging
import random
import uuid
from datetime import datetime, timezone

import aiosqlite

from .database import (
    create_session as db_create_session,
    get_session as db_get_session,
    get_user,
    get_user_preferences,
    get_vocab_progress,
    get_weak_words,
    list_sessions,
    update_session as db_update_session,
    upsert_vocab_progress,
)
from .llm import ask, ask_json, ask_messages
from .prompts import (
    CONVERSATION_TURN_PROMPT,
    FEEDBACK_PROMPT,
    GRAMMAR_LESSON_PROMPT,
    HINT_PROMPT,
    MODE_PROMPTS,
    TRANSLATION_BATCH_PROMPT,
    TRANSLATION_EVALUATE_PROMPT,
    VOCAB_BATCH_PROMPT,
)
from .questions import QUESTIONS, TOPICS
from .vocab_extraction import extract_vocab_from_session

log = logging.getLogger(__name__)

DIFFICULTY_LABELS = {
    "beginner": "beginner (A1-A2)",
    "intermediate": "intermediate (B1-B2)",
    "advanced": "advanced (C1-C2)",
}


# ── Learning Context ────────────────────────────────────────────────


async def _get_learning_context(
    db: aiosqlite.Connection, user_id: str, mode: str,
) -> tuple[str, list[str]]:
    """Build a distilled learning context string to inject into LLM prompts.

    Combines vocabulary progress, recent session history, and custom focus areas.
    Kept under ~500 tokens to avoid prompt bloat.

    Returns (context_string, focus_areas_list) so callers can explicitly
    reference focus areas in their instructions.
    """
    sections: list[str] = []

    # ── 1. Vocabulary progress summary ──
    all_vocab = await get_vocab_progress(db, user_id)
    if all_vocab:
        total = len(all_vocab)
        weak = await get_weak_words(db, user_id, limit=8)
        weak_words = [
            f"{w['slovak']} ({w['english']})" if w.get("english") else w["slovak"]
            for w in weak
        ]

        # Topics covered: derive from completed sessions
        all_sessions = await list_sessions(db, user_id)
        completed_sessions = [s for s in all_sessions if s["completed"]]
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
    if not all_vocab:
        all_sessions = await list_sessions(db, user_id)
        completed_sessions = [s for s in all_sessions if s["completed"]]
    mode_sessions = [
        s for s in all_sessions
        if s["completed"] and s["mode"] == mode and s.get("feedback")
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

    # ── 3. Custom focus areas ──
    prefs = await get_user_preferences(db, user_id)
    focus_areas = prefs.get("custom_focus_areas", [])
    if focus_areas:
        sections.append(f"[Student's custom focus areas]\n{', '.join(focus_areas)}")

    if not sections:
        return "", focus_areas

    return "\n\n".join(sections), focus_areas


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
    topic_label = TOPICS.get("vocabulary", {}).get(req.get("topic", ""), req.get("topic", "general"))
    difficulty = req.get("difficulty", "beginner")
    difficulty_label = DIFFICULTY_LABELS.get(difficulty, difficulty)

    learning_context, focus_areas = await _get_learning_context(db, req["user_id"], "vocabulary")

    prompt = f"Student level: {difficulty_label}\nTopic: {topic_label}\n"
    if learning_context:
        prompt += f"\n{learning_context}\n"
    prompt += (
        "\nGenerate 10 vocabulary quiz questions on this topic. "
        "Avoid repeating words the student has already mastered. "
        "Include some words they struggle with for reinforcement."
    )
    if focus_areas:
        prompt += (
            f"\n\nIMPORTANT: The student has requested focus on: {', '.join(focus_areas)}. "
            "You MUST theme your vocabulary around these areas. Choose words directly "
            "related to these interests — override the default topic categories if needed."
        )

    # Hard deduplication: fetch all previously seen words and exclude them
    all_vocab = await get_vocab_progress(db, req["user_id"])
    if all_vocab:
        # Exclude mastered words (>= 80% accuracy); allow weak words for reinforcement
        mastered_words = [
            w["slovak"]
            for w in all_vocab
            if w["times_seen"] >= 2 and w["times_correct"] / w["times_seen"] >= 0.8
        ]
        if mastered_words:
            word_list = ", ".join(mastered_words[:50])  # cap at 50 to avoid prompt bloat
            prompt += (
                f"\n\nDO NOT use any of these words — the student has already mastered them: "
                f"{word_list}"
            )

    data = await ask_json(prompt, VOCAB_BATCH_PROMPT)
    questions = data.get("questions", [])

    # Validate and pad choices
    for q in questions:
        if len(q.get("choices", [])) < 4:
            while len(q["choices"]) < 4:
                q["choices"].append("---")
        q["choices"] = q["choices"][:4]
        if q.get("correctIndex", 0) >= len(q["choices"]):
            q["correctIndex"] = 0

    exercises = {
        "type": "vocabulary",
        "questions": questions,
        "currentIndex": 0,
        "answers": [None] * len(questions),
        "retryQueue": [],
        "phase": "questions",
    }

    session = _build_session(req, exercises=exercises)
    await db_create_session(db, session)
    return session


async def _create_grammar_session(db: aiosqlite.Connection, req: dict) -> dict:
    topic_label = TOPICS.get("grammar", {}).get(req.get("topic", ""), req.get("topic", "general"))
    difficulty = req.get("difficulty", "beginner")
    difficulty_label = DIFFICULTY_LABELS.get(difficulty, difficulty)

    learning_context, focus_areas = await _get_learning_context(db, req["user_id"], "grammar")

    prompt = f"Student level: {difficulty_label}\nTopic: {topic_label}\n"
    if learning_context:
        prompt += f"\n{learning_context}\n"
    prompt += (
        "\nCreate a grammar lesson and exercises on this topic. "
        "Build on concepts the student has already covered."
    )
    if focus_areas:
        prompt += (
            f"\n\nIMPORTANT: The student has requested focus on: {', '.join(focus_areas)}. "
            "Use example sentences and vocabulary from these areas wherever possible."
        )

    data = await ask_json(prompt, GRAMMAR_LESSON_PROMPT)

    lesson = data.get("lesson", {})
    exercise_list = data.get("exercises", [])

    exercises = {
        "type": "grammar",
        "lesson": {
            "concept": lesson.get("concept", topic_label),
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
            }
            for ex in exercise_list
        ],
        "currentIndex": 0,
        "answers": [None] * len(exercise_list),
        "correct": [None] * len(exercise_list),
        "phase": "lesson",
    }

    session = _build_session(req, exercises=exercises)
    await db_create_session(db, session)
    return session


async def _create_translation_session(db: aiosqlite.Connection, req: dict) -> dict:
    topic_label = TOPICS.get("translation", {}).get(req.get("topic", ""), req.get("topic", "general"))
    difficulty = req.get("difficulty", "beginner")
    difficulty_label = DIFFICULTY_LABELS.get(difficulty, difficulty)

    learning_context, focus_areas = await _get_learning_context(db, req["user_id"], "translation")

    prompt = f"Student level: {difficulty_label}\nTopic: {topic_label}\n"
    if learning_context:
        prompt += f"\n{learning_context}\n"
    prompt += (
        "\nGenerate 10 translation exercises. "
        "Incorporate vocabulary the student has learned and introduce new words."
    )
    if focus_areas:
        prompt += (
            f"\n\nIMPORTANT: The student has requested focus on: {', '.join(focus_areas)}. "
            "Theme your translation sentences around these areas wherever possible."
        )

    data = await ask_json(prompt, TRANSLATION_BATCH_PROMPT)
    exercise_list = data.get("exercises", [])

    exercises = {
        "type": "translation",
        "exercises": [
            {
                "source": ex.get("source", ""),
                "direction": ex.get("direction", "en-sk"),
                "modelAnswer": ex.get("modelAnswer", ""),
                "keyPoints": ex.get("keyPoints", []),
            }
            for ex in exercise_list
        ],
        "currentIndex": 0,
        "answers": [None] * len(exercise_list),
        "phase": "exercises",
    }

    session = _build_session(req, exercises=exercises)
    await db_create_session(db, session)
    return session


async def _create_conversation_session(db: aiosqlite.Connection, req: dict) -> dict:
    topic = req.get("topic", "general")
    difficulty = req.get("difficulty", "beginner")
    difficulty_label = DIFFICULTY_LABELS.get(difficulty, difficulty)

    mode_questions = QUESTIONS.get("conversation", {})
    topic_questions = mode_questions.get(topic, [])
    question = random.choice(topic_questions) if topic_questions else (
        f"Let's have a conversation about {topic.replace('_', ' ')}."
    )

    topic_label = TOPICS.get("conversation", {}).get(topic, topic)
    user = await get_user(db, req["user_id"])
    student_name = user["name"] if user else "Student"

    learning_context, focus_areas = await _get_learning_context(db, req["user_id"], "conversation")

    prompt = (
        f"The student's name is {student_name} and they are at {difficulty_label} level.\n"
        f"Topic: {topic_label}\n"
    )
    if learning_context:
        prompt += f"\n{learning_context}\n"
    if focus_areas:
        prompt += (
            f"\nIMPORTANT: The student has requested focus on: {', '.join(focus_areas)}. "
            "Steer the conversation toward these areas and introduce related vocabulary.\n"
        )
    prompt += (
        f"\nStart the conversation with this scenario: {question}\n\n"
        f"Begin now — greet {student_name} and start the conversation. "
        f"Remember: ONLY 2-3 sentences maximum for your first message."
    )

    messages = [{"role": "user", "content": prompt}]
    response = await ask_messages(messages, CONVERSATION_TURN_PROMPT)

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
    is_correct = choice_index == q["correctIndex"]
    ex["answers"][idx] = choice_index

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
        # Remove from retry queue on correct, keep on wrong
        if is_correct and idx in ex["retryQueue"]:
            ex["retryQueue"].remove(idx)
        remaining = ex["retryQueue"]
        if remaining:
            ex["currentIndex"] = remaining[0]
        else:
            ex["phase"] = "complete"

    await db_update_session(
        db, session_id,
        exercises_json=ex,
        messages_json=session["messages"],
    )
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
    is_correct = answer.strip().lower() == correct_answer.strip().lower()

    ex["answers"][idx] = answer
    ex["correct"][idx] = is_correct

    # Synthetic message
    session["messages"].append({
        "role": "student",
        "content": f"Answer: {answer} ({'correct' if is_correct else f'incorrect, correct: {correct_answer}'})"
    })

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

    # LLM evaluation
    eval_prompt = (
        f"Source ({exercise['direction']}): {exercise['source']}\n"
        f"Model answer: {exercise['modelAnswer']}\n"
        f"Student's translation: {answer}\n\n"
        f"Evaluate the student's translation."
    )

    eval_data = await ask_json(eval_prompt, TRANSLATION_EVALUATE_PROMPT)
    score = eval_data.get("score", 5)
    feedback = eval_data.get("feedback", "")

    ex["answers"][idx] = {
        "userAnswer": answer,
        "score": score,
        "feedback": feedback,
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
    topic_label = TOPICS.get("conversation", {}).get(session["topic"], session["topic"])
    scenario = ex.get("scenario", "")

    system_prompt = (
        f"{CONVERSATION_TURN_PROMPT}\n\n"
        f"Student level: {difficulty_label}\n"
        f"Topic: {topic_label}\n"
        f"Scenario: {scenario}"
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

    response = await ask_messages(merged, system_prompt)
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

        response = await ask_messages(merged, HINT_PROMPT)
    else:
        conversation = _build_conversation(session["messages"])
        prompt = f"Conversation so far:\n{conversation}\n\nProvide a helpful hint for the student."
        response = await ask(prompt, HINT_PROMPT)

    session["messages"].append({"role": "system", "content": f"\U0001f4a1 {response}"})

    await db_update_session(db, session_id, messages_json=session["messages"])
    return session


# ── End Session ──────────────────────────────────────────────────────

async def end_session(db: aiosqlite.Connection, session_id: str) -> dict:
    session = await db_get_session(db, session_id)
    if not session:
        raise ValueError("Session not found")

    conversation = _build_conversation(session["messages"])
    mode_label = session["mode"].replace("_", " ").title()
    topic_label = TOPICS.get(session["mode"], {}).get(session["topic"], session["topic"])

    prompt = (
        f"Mode: {mode_label}\n"
        f"Topic: {topic_label}\n"
        f"Difficulty: {session['difficulty']}\n\n"
        f"Full session transcript:\n{conversation}\n\n"
        f"Analyze this session and provide feedback as JSON."
    )

    data = await ask_json(prompt, FEEDBACK_PROMPT)

    feedback = {
        "overall_score": data.get("overall_score", 5),
        "scores": [
            {"category": s.get("category", ""), "score": s.get("score", 5), "comment": s.get("comment", "")}
            for s in data.get("scores", [])
        ],
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

    # Extract and persist vocabulary progress
    try:
        session_with_feedback = await db_get_session(db, session_id)
        if session_with_feedback:
            words = extract_vocab_from_session(session_with_feedback)
            if words:
                await upsert_vocab_progress(db, session_with_feedback["user_id"], words)
                log.info("Tracked %d words for user %s", len(words), session_with_feedback["user_id"])
    except Exception:
        log.exception("Failed to extract vocab progress for session %s", session_id)

    return feedback


# ── Helpers ──────────────────────────────────────────────────────────

def _build_session(req: dict, exercises: dict | None = None, messages: list[dict] | None = None) -> dict:
    return {
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


def _build_conversation(messages: list[dict]) -> str:
    lines = []
    for msg in messages:
        role = msg.get("role", "system")
        label = "Tutor" if role == "tutor" else "Student" if role == "student" else "System"
        lines.append(f"{label}: {msg['content']}")
    return "\n".join(lines)

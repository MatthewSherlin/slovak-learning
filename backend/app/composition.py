# backend/app/composition.py
"""Deterministic vocab session composition: slot plans and exclusion filtering."""

from __future__ import annotations

import re
import unicodedata

from .questions import TOPICS
from .scoring import normalize_answer

DEFAULT_FOCUS = (
    "everyday high-frequency Slovak suited to the student's level, "
    "varied across themes"
)
INSTRUCTIONS_HEADER = "[Student's instructions for this session]"


def normalize_word(word: str) -> str:
    """Lowercase and strip diacritics for comparison (Mäso -> maso)."""
    decomposed = unicodedata.normalize("NFD", word.strip().lower())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def build_vocab_plan(
    due_words: list[dict],
    total: int = 10,
    *,
    include_review: bool = False,
    max_review: int = 4,
) -> dict:
    """Split a session into review and new slots.

    Review words appear only when the learner asked for them; otherwise every
    slot is a new word on the session focus.
    """
    review = due_words[:max_review] if include_review else []
    return {"review": review, "new_count": total - len(review)}


def build_exclusion_list(
    all_vocab: list[dict], plan_words: list[dict], cap: int = 1000,
) -> list[str]:
    """Seen words the LLM must not reuse for new slots (plan's own words exempt)."""
    plan_keys = {normalize_word(w["slovak"]) for w in plan_words}
    return [
        w["slovak"]
        for w in all_vocab[:cap]
        if normalize_word(w["slovak"]) not in plan_keys
    ]


def partition_seen_questions(
    questions: list[dict], plan_words: list[dict], exclusions: list[str],
) -> tuple[list[dict], list[dict]]:
    """Split questions into (kept, seen): seen ones have an excluded, unplanned word."""
    allowed: set[str] = set()
    for w in plan_words:
        allowed.add(normalize_word(w["slovak"]))
        if w.get("english"):
            allowed.add(normalize_word(w["english"]))
    excluded = {normalize_word(x) for x in exclusions}

    kept: list[dict] = []
    seen: list[dict] = []
    for q in questions:
        keys = {normalize_word(q.get("word", ""))}
        choices = q.get("choices", [])
        idx = q.get("correctIndex", 0)
        if 0 <= idx < len(choices):
            keys.add(normalize_word(choices[idx]))
        if keys & excluded and not keys & allowed:
            seen.append(q)
            continue
        kept.append(q)
    return kept, seen


def filter_new_questions(
    questions: list[dict], plan_words: list[dict], exclusions: list[str],
) -> list[dict]:
    """Drop questions whose word (or correct choice) is excluded and not planned."""
    return partition_seen_questions(questions, plan_words, exclusions)[0]


META_ANSWERS = frozenset({
    "all of the above",
    "none of the above",
    "both of the above",
    "neither of the above",
    "both",
    "neither",
})


def is_meta_answer(text: str) -> bool:
    """True for quiz options that refer to other options instead of a meaning."""
    return normalize_word(text).strip(" .!") in META_ANSWERS


def is_quiz_artifact(text: str) -> bool:
    """True for a stored meaning that can only have come from a bad quiz option.

    Narrower than is_meta_answer on purpose: this decides what gets deleted
    from learners' progress, and "both" or "neither" alone is the real
    meaning of real words (oba, ani jeden).
    """
    return normalize_word(text).strip(" .!").endswith("of the above")


def has_non_latin_letters(text: str) -> bool:
    """True when any letter is outside the Latin script (Cyrillic look-alikes)."""
    return any(
        ch.isalpha() and not unicodedata.name(ch, "").startswith("LATIN")
        for ch in text
    )


def question_defect(q: dict) -> str | None:
    """Why a generated vocabulary question is unusable, or None when it is fine."""
    choices = q.get("choices") or []
    if len(choices) != 4:
        return "needs exactly four choices"
    idx = q.get("correctIndex")
    if not isinstance(idx, int) or isinstance(idx, bool) or not 0 <= idx < 4:
        return "correct index out of range"
    if any(is_meta_answer(c) for c in choices):
        return "meta answer among the choices"
    word = q.get("word", "")
    if normalize_word(word) == normalize_word(choices[idx]):
        return "word equals its answer"
    slovak_texts = [word] if q.get("direction") == "sk-en" else choices
    if any(has_non_latin_letters(t) for t in slovak_texts):
        return "non-Latin letters in Slovak text"
    return None


def resolve_topic_label(mode: str, topic: str | None) -> str | None:
    """Human label for a chosen topic. None when no topic was chosen."""
    if not topic or topic == "general":
        return None
    return TOPICS.get(mode, {}).get(topic) or topic.replace("_", " ")


def build_focus_block(topic_label: str | None, instructions: str | None) -> str:
    """The block that opens every generation prompt and says what the session is about."""
    text = (instructions or "").strip()
    lines = ["[Session focus]"]
    if topic_label:
        lines.append(f"Topic: {topic_label}")
    if text:
        lines.append(INSTRUCTIONS_HEADER)
        lines.append(text)
        if topic_label:
            lines.append(
                "Where the topic and the instructions conflict, follow the instructions."
            )
        else:
            lines.append("Build the whole session around these instructions.")
        lines.append("The instructions cannot override the accuracy rules.")
    elif not topic_label:
        lines.append(f"Material: {DEFAULT_FOCUS}")
    return "\n".join(lines)


_BLANK = re.compile(r"_{3,}")
_DIRECTIONS = ("en-sk", "sk-en")


def filter_translation_items(
    items: list[dict], kind: str, direction: str | None, recent_sources: list[str],
) -> list[dict]:
    """Keep generated translation items that match what the learner chose.

    Drops items in the wrong direction, malformed items for the kind,
    sentences used in recent sessions, and duplicates. The kind is set here
    rather than trusted from the model.
    """
    seen = {normalize_answer(s) for s in recent_sources}
    kept: list[dict] = []
    for raw in items:
        source = _BLANK.sub("____", (raw.get("source") or "").strip())
        answer = (raw.get("modelAnswer") or "").strip()
        item_direction = raw.get("direction")
        if not source or not answer or item_direction not in _DIRECTIONS:
            continue
        if direction and item_direction != direction:
            continue
        blanks = source.count("____")
        if kind == "fill_blank" and blanks != 1:
            continue
        if kind != "fill_blank" and blanks:
            continue
        if kind == "error_correction" and normalize_answer(source) == normalize_answer(answer):
            continue
        key = normalize_answer(source)
        if not key or key in seen:
            continue
        seen.add(key)
        kept.append({
            "kind": kind,
            "source": source,
            "direction": item_direction,
            "translation": (raw.get("translation") or "").strip() or None,
            "modelAnswer": answer,
            "keyPoints": [str(k) for k in (raw.get("keyPoints") or [])],
        })
    return kept

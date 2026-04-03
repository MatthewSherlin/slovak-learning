"""Extract vocabulary from completed sessions for progress tracking."""

from __future__ import annotations

import logging

log = logging.getLogger(__name__)


def extract_vocab_from_session(session: dict) -> list[dict]:
    """Extract vocabulary words with correctness from a completed session.

    Returns list of dicts: {slovak, english, correct: bool, source_mode}
    """
    mode = session.get("mode", "")
    exercises = session.get("exercises")
    feedback = session.get("feedback")

    extractors = {
        "vocabulary": _extract_from_vocab,
        "grammar": _extract_from_grammar,
        "translation": _extract_from_feedback,
        "conversation": _extract_from_feedback,
    }

    extractor = extractors.get(mode, _extract_from_feedback)
    words = extractor(session, exercises, feedback)

    # Deduplicate by normalized slovak word
    seen: set[str] = set()
    unique: list[dict] = []
    for w in words:
        key = w["slovak"].strip().lower()
        if key and key not in seen:
            seen.add(key)
            unique.append(w)

    return unique


def _extract_from_vocab(
    session: dict, exercises: dict | None, feedback: dict | None
) -> list[dict]:
    """Extract from vocabulary mode exercises."""
    if not exercises or "questions" not in exercises:
        return _extract_from_feedback(session, exercises, feedback)

    words: list[dict] = []
    questions = exercises["questions"]
    answers = exercises.get("answers", [])

    for i, q in enumerate(questions):
        word = q.get("word", "")
        direction = q.get("direction", "sk-en")
        correct_idx = q.get("correctIndex", 0)
        choices = q.get("choices", [])
        correct_answer = choices[correct_idx] if correct_idx < len(choices) else ""
        user_answer = answers[i] if i < len(answers) else None
        is_correct = user_answer == correct_idx

        if direction == "sk-en":
            slovak = word
            english = correct_answer
        else:
            slovak = correct_answer
            english = word

        words.append({
            "slovak": slovak,
            "english": english,
            "correct": is_correct,
            "source_mode": "vocabulary",
        })

    return words


def _extract_from_grammar(
    session: dict, exercises: dict | None, feedback: dict | None
) -> list[dict]:
    """Extract blank words from grammar exercises + feedback vocabulary."""
    words: list[dict] = []

    if exercises and "exercises" in exercises:
        exercise_list = exercises["exercises"]
        correct_flags = exercises.get("correct", [])

        for i, ex in enumerate(exercise_list):
            blank = ex.get("blank", "")
            if blank:
                is_correct = correct_flags[i] if i < len(correct_flags) else False
                words.append({
                    "slovak": blank,
                    "english": "",
                    "correct": bool(is_correct),
                    "source_mode": "grammar",
                })

    # Supplement with feedback vocabulary_learned for richer data
    if feedback and feedback.get("vocabulary_learned"):
        for v in feedback["vocabulary_learned"]:
            words.append({
                "slovak": v.get("slovak", ""),
                "english": v.get("english", ""),
                "correct": True,
                "source_mode": "grammar",
            })

    return words


def _extract_from_feedback(
    session: dict, exercises: dict | None, feedback: dict | None
) -> list[dict]:
    """Extract from LLM-generated feedback vocabulary_learned."""
    if not feedback or not feedback.get("vocabulary_learned"):
        return []

    mode = session.get("mode", "unknown")
    words: list[dict] = []
    for v in feedback["vocabulary_learned"]:
        words.append({
            "slovak": v.get("slovak", ""),
            "english": v.get("english", ""),
            "correct": True,
            "source_mode": mode,
        })

    return words

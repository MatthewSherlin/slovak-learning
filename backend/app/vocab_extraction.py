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
        "grammar": _extract_from_feedback,
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


def question_pair(q: dict) -> tuple[str, str]:
    """The (slovak, english) pair a vocabulary question teaches."""
    choices = q.get("choices", [])
    idx = q.get("correctIndex", 0)
    answer = choices[idx] if 0 <= idx < len(choices) else ""
    if q.get("direction", "sk-en") == "sk-en":
        return q.get("word", ""), answer
    return answer, q.get("word", "")


def _extract_from_vocab(
    session: dict, exercises: dict | None, feedback: dict | None
) -> list[dict]:
    """Extract from vocabulary mode exercises."""
    if not exercises or "questions" not in exercises:
        return _extract_from_feedback(session, exercises, feedback)

    if exercises.get("srsPerAnswer"):
        return []  # each word was saved when its first answer arrived

    words: list[dict] = []
    questions = exercises["questions"]
    answers = exercises.get("answers", [])
    credits = exercises.get("credits", [])

    for i, q in enumerate(questions):
        correct_idx = q.get("correctIndex", 0)
        user_answer = answers[i] if i < len(answers) else None
        # Credits preserve the first-attempt outcome (retry overwrites answers):
        # only full credit counts as correct so missed words resurface in the SRS.
        credit = credits[i] if i < len(credits) else None
        if credit is not None:
            is_correct = credit >= 1.0
        else:
            is_correct = user_answer == correct_idx

        slovak, english = question_pair(q)

        words.append({
            "slovak": slovak,
            "english": english,
            "correct": is_correct,
            "source_mode": "vocabulary",
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

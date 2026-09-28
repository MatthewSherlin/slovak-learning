"""Deterministic answer grading and session scoring.

The backend is the source of truth for all scoring. The results page is
built from these numbers; no model writes a summary of the lesson.
"""

from __future__ import annotations

import re
import unicodedata
from typing import NamedTuple

_APOSTROPHES = re.compile("['‘’`´]")
_NON_WORD = re.compile(r"[^\w\s]", re.UNICODE)


class AnswerGrade(NamedTuple):
    tier: str  # "exact" | "accent" | "wrong"
    credit: float


def strip_accents(s: str) -> str:
    """Remove combining marks: 'vidím' -> 'vidim'."""
    decomposed = unicodedata.normalize("NFD", s)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def normalize_answer(s: str, *, strip_diacritics: bool = True) -> str:
    """Reduce an answer to the parts that are graded.

    Case, punctuation and spacing never matter. Diacritics are removed too
    unless strip_diacritics is False.
    """
    text = unicodedata.normalize("NFC", s).lower()
    if strip_diacritics:
        text = strip_accents(text)
    text = _APOSTROPHES.sub("", text)
    # Replace non-word chars with space, but preserve combining marks
    text = "".join(
        " " if (_NON_WORD.match(ch) and not unicodedata.combining(ch)) else ch
        for ch in text
    )
    return " ".join(text.split())


def grade_answer(expected: str, given: str) -> AnswerGrade:
    """Grade a typed answer against the expected form.

    exact  (1.0): matches ignoring case, punctuation and spacing
    accent (1.0): matches only after stripping diacritics. Learners type on
                  English keyboards, so this is a correct answer; the tier
                  lets the interface show the accented spelling.
    wrong  (0.0): anything else, including an answer with no letters or digits
    """
    given_plain = normalize_answer(given)
    if not given_plain:
        return AnswerGrade("wrong", 0.0)
    if normalize_answer(expected, strip_diacritics=False) == normalize_answer(
        given, strip_diacritics=False
    ):
        return AnswerGrade("exact", 1.0)
    if normalize_answer(expected) == given_plain:
        return AnswerGrade("accent", 1.0)
    return AnswerGrade("wrong", 0.0)


def _round1(x: float) -> float:
    return round(x, 2)


def _vocab_credits(ex: dict) -> list[float]:
    credits = ex.get("credits")
    if credits and any(c is not None for c in credits):
        return [c if c is not None else 0.0 for c in credits]
    # Legacy sessions: derive binary credit from final answers
    return [
        1.0 if a is not None and a == q.get("correctIndex") else 0.0
        for a, q in zip(ex.get("answers", []), ex.get("questions", []))
    ]


def _grammar_credits(ex: dict) -> list[float]:
    """Each grammar item's credit. An item answered before credits existed
    has none and falls back to whether it was right; unanswered counts as 0."""
    credits = ex.get("credits") or []
    correct = ex.get("correct") or []
    vals: list[float] = []
    for i in range(max(len(credits), len(correct))):
        credit = credits[i] if i < len(credits) else None
        if credit is None:
            credit = 1.0 if i < len(correct) and correct[i] is True else 0.0
        vals.append(credit)
    return vals


def compute_session_score(exercises: dict | None) -> float | None:
    """Compute the 0-10 session score from answer data. None = unscorable."""
    if not exercises:
        return None
    kind = exercises.get("type")
    if kind == "vocabulary":
        credits = _vocab_credits(exercises)
        if not credits:
            return None
        return _round1(sum(credits) / len(credits) * 10)
    if kind == "grammar":
        credits = exercises.get("credits")
        if not credits or all(c is None for c in credits):
            # Legacy sessions: unanswered exercises count as 0, matching the
            # credits path — ending early must not inflate the score.
            correct = exercises.get("correct", [])
            if all(c is None for c in correct):
                return None
            return _round1(sum(1.0 for c in correct if c) / len(correct) * 10)
        vals = _grammar_credits(exercises)
        return _round1(sum(vals) / len(vals) * 10)
    if kind == "translation":
        answers = exercises.get("answers", [])
        answered = [a for a in answers if a]
        if not answered:
            return None
        # Unanswered exercises count as 0 — same rule as vocab and grammar.
        return _round1(sum(a.get("score", 0) for a in answered) / len(answers))
    return None  # conversation and unknown types


def compute_category_scores(exercises: dict | None) -> list[dict]:
    """Deterministic per-category breakdown for the feedback screen."""
    if not exercises:
        return []
    kind = exercises.get("type")
    if kind == "vocabulary":
        credits = _vocab_credits(exercises)
        questions = exercises.get("questions", [])
        buckets: dict[str, list[float]] = {"Word recognition (SK→EN)": [], "Recall (EN→SK)": []}
        for q, c in zip(questions, credits):
            key = "Word recognition (SK→EN)" if q.get("direction") == "sk-en" else "Recall (EN→SK)"
            buckets[key].append(c)
        cats = []
        for name, vals in buckets.items():
            if vals:
                score = _round1(sum(vals) / len(vals) * 10)
                cats.append({"category": name, "score": score, "comment": ""})
        recovered = sum(1 for c in credits if c == 0.5)
        missed = sum(1 for c in credits if c in (0.0, 0.5))
        if recovered and missed:
            cats.append({
                "category": "Retry recovery",
                "score": _round1(recovered / missed * 10),
                "comment": f"Recovered {recovered} of {missed} missed word(s) on retry.",
            })
        return cats
    if kind == "grammar":
        if not exercises.get("credits"):
            return []
        credits = _grammar_credits(exercises)
        accuracy = _round1(sum(credits) / len(credits) * 10)
        return [{"category": "Accuracy", "score": accuracy, "comment": ""}]
    if kind == "translation":
        answered = [a for a in exercises.get("answers", []) if a]
        if not answered:
            return []
        avg = _round1(sum(a.get("score", 0) for a in answered) / len(answered))
        return [{"category": "Translation quality", "score": avg, "comment": ""}]
    return []

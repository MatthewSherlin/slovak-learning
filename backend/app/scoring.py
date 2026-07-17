"""Deterministic answer grading and session scoring.

The backend is the source of truth for all scoring. The LLM only writes
narrative feedback (strengths, improvements, notes) — see prompts.py.
"""

from __future__ import annotations

import unicodedata
from typing import NamedTuple


class AnswerGrade(NamedTuple):
    tier: str  # "exact" | "accent" | "wrong"
    credit: float


def strip_accents(s: str) -> str:
    """Remove combining marks: 'vidím' -> 'vidim'."""
    decomposed = unicodedata.normalize("NFD", s)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def _norm(s: str) -> str:
    return s.strip().lower()


def grade_answer(expected: str, given: str) -> AnswerGrade:
    """Grade a typed answer against the expected form.

    exact  (1.0): matches ignoring case/surrounding whitespace
    accent (0.8): matches only after stripping diacritics — right word,
                  wrong accents
    wrong  (0.0): anything else
    """
    exp, giv = _norm(expected), _norm(given)
    if exp == giv:
        return AnswerGrade("exact", 1.0)
    if giv and strip_accents(exp) == strip_accents(giv):
        return AnswerGrade("accent", 0.8)
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
            correct = [c for c in exercises.get("correct", []) if c is not None]
            if not correct:
                return None
            return _round1(sum(1.0 for c in correct if c) / len(correct) * 10)
        vals = [c if c is not None else 0.0 for c in credits]
        return _round1(sum(vals) / len(vals) * 10)
    if kind == "translation":
        answered = [a for a in exercises.get("answers", []) if a]
        if not answered:
            return None
        return _round1(sum(a.get("score", 0) for a in answered) / len(answered))
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
        if recovered:
            cats.append({
                "category": "Retry recovery",
                "score": 10.0,
                "comment": f"Recovered {recovered} missed word(s) on retry.",
            })
        return cats
    if kind == "grammar":
        credits = [c if c is not None else 0.0 for c in exercises.get("credits") or []]
        if not credits:
            return []
        accuracy = _round1(sum(credits) / len(credits) * 10)
        cats: list[dict] = [{"category": "Accuracy", "score": accuracy, "comment": ""}]
        tiers = exercises.get("tiers") or []
        answered = [t for t in tiers if t is not None]
        if answered:
            accent_misses = sum(1 for t in answered if t == "accent")
            diacritics = _round1((1 - accent_misses / len(answered)) * 10)
            comment = (
                f"{accent_misses} answer(s) missed only the diacritics."
                if accent_misses else "All diacritics correct."
            )
            cats.append({"category": "Diacritics", "score": diacritics, "comment": comment})
        return cats
    if kind == "translation":
        answered = [a for a in exercises.get("answers", []) if a]
        if not answered:
            return []
        avg = _round1(sum(a.get("score", 0) for a in answered) / len(answered))
        return [{"category": "Translation quality", "score": avg, "comment": ""}]
    return []

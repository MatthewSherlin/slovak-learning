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

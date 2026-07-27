# backend/app/composition.py
"""Deterministic vocab session composition: slot plans and exclusion filtering."""

from __future__ import annotations

import unicodedata


def normalize_word(word: str) -> str:
    """Lowercase and strip diacritics for comparison (Mäso -> maso)."""
    decomposed = unicodedata.normalize("NFD", word.strip().lower())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def filter_weak(words: list[dict], threshold: float = 0.6) -> list[dict]:
    """Words with accuracy below threshold (seen at least once)."""
    out: list[dict] = []
    for w in words:
        seen = w.get("times_seen", 0)
        if seen and w.get("times_correct", 0) / seen < threshold:
            out.append(w)
    return out


def build_vocab_plan(
    due_words: list[dict], weak_words: list[dict], total: int = 10,
) -> dict:
    """Split a session into review/reinforce/new slots.

    Due words fill up to 4 review slots; weak words not already in review
    fill up to 2 reinforce slots; the remainder are new-word slots.
    """
    review = due_words[:4]
    review_keys = {normalize_word(w["slovak"]) for w in review}
    reinforce = [
        w for w in weak_words if normalize_word(w["slovak"]) not in review_keys
    ][:2]
    return {
        "review": review,
        "reinforce": reinforce,
        "new_count": total - len(review) - len(reinforce),
    }


def build_exclusion_list(
    all_vocab: list[dict], plan_words: list[dict], cap: int = 150,
) -> list[str]:
    """Seen words the LLM must not reuse for new slots (plan's own words exempt)."""
    plan_keys = {normalize_word(w["slovak"]) for w in plan_words}
    return [
        w["slovak"]
        for w in all_vocab[:cap]
        if normalize_word(w["slovak"]) not in plan_keys
    ]


def filter_new_questions(
    questions: list[dict], plan_words: list[dict], exclusions: list[str],
) -> list[dict]:
    """Drop questions whose word (or correct choice) is excluded and not planned."""
    allowed: set[str] = set()
    for w in plan_words:
        allowed.add(normalize_word(w["slovak"]))
        if w.get("english"):
            allowed.add(normalize_word(w["english"]))
    excluded = {normalize_word(x) for x in exclusions}

    kept: list[dict] = []
    for q in questions:
        keys = {normalize_word(q.get("word", ""))}
        choices = q.get("choices", [])
        idx = q.get("correctIndex", 0)
        if 0 <= idx < len(choices):
            keys.add(normalize_word(choices[idx]))
        if keys & excluded and not keys & allowed:
            continue
        kept.append(q)
    return kept

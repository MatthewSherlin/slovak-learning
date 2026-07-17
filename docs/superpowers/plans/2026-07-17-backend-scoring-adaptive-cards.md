# Backend: Scoring Core + Adaptive Layer + Card Gameplay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tiered partial-credit scoring computed by the backend, spaced-repetition + concept-mastery recommendations, and the expanded card economy (5-card packs, mythic rarity, trade-in, showcase).

**Architecture:** New pure module `app/scoring.py` grades answers and computes session scores; `sessions.py` stores per-answer credits and uses computed scores in `end_session` (LLM demoted to narrative). `database.py` gains SRS columns, `concept_progress`, `xp_adjustments`, card `copies`, and `users.showcase_card_id`. New endpoints: recommendations, trade-in, showcase.

**Tech Stack:** Python 3.11+/FastAPI/aiosqlite, pytest + pytest-asyncio, httpx ASGI test client.

## Global Constraints

- Working dir for all commands: `/Users/nilrehsttam/Repos/slovak-learning/backend`
- Python: `.venv/bin/python` (run tests as `.venv/bin/python -m pytest tests/ -q`)
- TDD: every task writes its failing test FIRST and verifies RED before implementing.
- Schema migrations: `ALTER TABLE ... ADD COLUMN` inside `try/except Exception: pass` in `init_db()` (existing pattern at `database.py:101-105`).
- All XP mutations inside `BEGIN IMMEDIATE` transactions (pattern at `database.py:purchase_farm_item`).
- Commit after each task with conventional format (`feat:`/`fix:`/`test:`), lowercase, no co-author lines; use the user's git identity.
- Existing 102 tests must stay green after every task.
- New pack weights: common 50, uncommon 30, rare 15, legendary 4, mythic 1.
- Trade-in XP values: common 20, uncommon 40, rare 80, legendary 200, mythic 500.

---

### Task 1: `scoring.grade_answer` — tiered answer grading

**Files:**
- Create: `app/scoring.py`
- Test: `tests/test_scoring.py`

**Interfaces:**
- Produces: `grade_answer(expected: str, given: str) -> AnswerGrade` where `AnswerGrade` is a `NamedTuple(tier: str, credit: float)`; tiers `"exact"` (1.0), `"accent"` (0.8), `"wrong"` (0.0). Also `strip_accents(s: str) -> str`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_scoring.py
"""Tests for deterministic answer grading and session scoring."""

from __future__ import annotations

from app.scoring import grade_answer, strip_accents


class TestStripAccents:
    def test_strips_slovak_diacritics(self):
        assert strip_accents("vidím") == "vidim"
        assert strip_accents("mäso") == "maso"
        assert strip_accents("ťažký") == "tazky"
        assert strip_accents("ľúbiť") == "lubit"

    def test_plain_ascii_unchanged(self):
        assert strip_accents("dom") == "dom"


class TestGradeAnswer:
    def test_exact_match(self):
        g = grade_answer("vidím", "vidím")
        assert g.tier == "exact"
        assert g.credit == 1.0

    def test_exact_is_case_and_whitespace_insensitive(self):
        g = grade_answer("vidím", "  VIDÍM ")
        assert g.tier == "exact"

    def test_accent_only_miss_gets_partial_credit(self):
        g = grade_answer("vidím", "vidim")
        assert g.tier == "accent"
        assert g.credit == 0.8

    def test_accent_miss_multiple_diacritics(self):
        g = grade_answer("mäso", "maso")
        assert g.tier == "accent"

    def test_wrong_answer(self):
        g = grade_answer("vidím", "vidil")
        assert g.tier == "wrong"
        assert g.credit == 0.0

    def test_empty_answer_is_wrong(self):
        g = grade_answer("vidím", "")
        assert g.tier == "wrong"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_scoring.py -q`
Expected: collection ERROR — `ModuleNotFoundError: No module named 'app.scoring'`

- [ ] **Step 3: Write minimal implementation**

```python
# app/scoring.py
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_scoring.py -q`
Expected: 8 passed

- [ ] **Step 5: Run full suite, then commit**

Run: `.venv/bin/python -m pytest tests/ -q` — expected: all pass.

```bash
git add app/scoring.py tests/test_scoring.py
git commit -m "feat: add tiered answer grading with accent partial credit"
```

---

### Task 2: `scoring.compute_session_score` + category breakdown

**Files:**
- Modify: `app/scoring.py`
- Test: `tests/test_scoring.py`

**Interfaces:**
- Consumes: exercise dicts as stored in `sessions` rows (`exercises_json` shapes in `app/models.py`).
- Produces:
  - `compute_session_score(exercises: dict) -> float | None` — 0–10, or `None` for conversation mode / unscorable data.
  - `compute_category_scores(exercises: dict) -> list[dict]` — `[{"category": str, "score": float, "comment": str}]`; empty list for conversation.
- Vocab credit rule: first-try correct = 1.0, recovered-on-retry = 0.5, never-correct = 0.0 (uses `credits` array written by Task 3's sessions changes; falls back to deriving from `answers`/`correctIndex` when `credits` absent — old sessions).

- [ ] **Step 1: Write the failing tests** (append to `tests/test_scoring.py`)

```python
from app.scoring import compute_category_scores, compute_session_score


def _vocab_ex(credits, questions=None):
    n = len(credits)
    qs = questions or [
        {"word": f"w{i}", "direction": "sk-en" if i % 2 == 0 else "en-sk",
         "choices": ["a", "b", "c", "d"], "correctIndex": 0, "explanation": ""}
        for i in range(n)
    ]
    return {
        "type": "vocabulary", "questions": qs, "currentIndex": n,
        "answers": [0] * n, "credits": credits, "retryQueue": [], "phase": "complete",
    }


class TestComputeSessionScore:
    def test_vocab_all_first_try(self):
        assert compute_session_score(_vocab_ex([1.0, 1.0, 1.0, 1.0])) == 10.0

    def test_vocab_mixed_retry_recovery(self):
        # 2 first-try, 1 recovered (0.5), 1 never -> (1+1+0.5+0)/4*10 = 6.25
        assert compute_session_score(_vocab_ex([1.0, 1.0, 0.5, 0.0])) == 6.25

    def test_vocab_legacy_session_without_credits(self):
        ex = _vocab_ex([None, None])
        del ex["credits"]
        ex["answers"] = [0, 1]  # correctIndex is 0 -> one right, one wrong
        assert compute_session_score(ex) == 5.0

    def test_grammar_uses_credits(self):
        ex = {
            "type": "grammar", "lesson": {}, "exercises": [{}, {}, {}],
            "currentIndex": 3, "answers": ["a", "b", "c"],
            "correct": [True, False, False], "credits": [1.0, 0.8, 0.0],
            "phase": "complete",
        }
        assert compute_session_score(ex) == 6.0  # (1+0.8+0)/3*10

    def test_grammar_legacy_without_credits(self):
        ex = {
            "type": "grammar", "lesson": {}, "exercises": [{}, {}],
            "currentIndex": 2, "answers": ["a", "b"],
            "correct": [True, False], "phase": "complete",
        }
        assert compute_session_score(ex) == 5.0

    def test_translation_averages_llm_scores(self):
        ex = {
            "type": "translation", "exercises": [{}, {}],
            "currentIndex": 2, "phase": "complete",
            "answers": [
                {"userAnswer": "x", "score": 8.0, "feedback": ""},
                {"userAnswer": "y", "score": 6.0, "feedback": ""},
            ],
        }
        assert compute_session_score(ex) == 7.0

    def test_conversation_returns_none(self):
        ex = {"type": "conversation", "exchangeCount": 5, "maxExchanges": 10, "phase": "complete"}
        assert compute_session_score(ex) is None

    def test_no_answers_returns_none(self):
        ex = _vocab_ex([])
        assert compute_session_score(ex) is None


class TestCategoryScores:
    def test_vocab_splits_by_direction(self):
        qs = [
            {"word": "a", "direction": "sk-en", "choices": ["x"], "correctIndex": 0, "explanation": ""},
            {"word": "b", "direction": "en-sk", "choices": ["x"], "correctIndex": 0, "explanation": ""},
        ]
        ex = _vocab_ex([1.0, 0.0], questions=qs)
        cats = compute_category_scores(ex)
        by_name = {c["category"]: c["score"] for c in cats}
        assert by_name["Word recognition (SK→EN)"] == 10.0
        assert by_name["Recall (EN→SK)"] == 0.0

    def test_grammar_has_accuracy_and_diacritics(self):
        ex = {
            "type": "grammar", "lesson": {}, "exercises": [{}, {}],
            "currentIndex": 2, "answers": ["a", "b"],
            "correct": [True, False], "credits": [1.0, 0.8],
            "tiers": ["exact", "accent"], "phase": "complete",
        }
        cats = compute_category_scores(ex)
        names = [c["category"] for c in cats]
        assert "Accuracy" in names
        assert "Diacritics" in names

    def test_conversation_empty(self):
        assert compute_category_scores({"type": "conversation"}) == []
```

- [ ] **Step 2: Run to verify RED**

Run: `.venv/bin/python -m pytest tests/test_scoring.py -q`
Expected: FAIL — `ImportError: cannot import name 'compute_session_score'`

- [ ] **Step 3: Implement** (append to `app/scoring.py`)

```python
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
        buckets = {"Word recognition (SK→EN)": [], "Recall (EN→SK)": []}
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
        cats = [{"category": "Accuracy", "score": accuracy, "comment": ""}]
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
```

- [ ] **Step 4: Verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_scoring.py -q` — expected: all pass.

- [ ] **Step 5: Full suite + commit**

```bash
.venv/bin/python -m pytest tests/ -q
git add app/scoring.py tests/test_scoring.py
git commit -m "feat: compute session scores and category breakdown from answer data"
```

---

### Task 3: Store credits/tiers at answer-submission time

**Files:**
- Modify: `app/sessions.py` (`_create_vocab_session`, `_create_grammar_session`, `submit_vocab_answer`, `submit_grammar_answer`)
- Modify: `app/models.py` (`VocabExerciseData`, `GrammarExerciseData`)
- Test: `tests/test_sessions.py`

**Interfaces:**
- Consumes: `grade_answer` from Task 1.
- Produces: vocab exercises gain `credits: list[float | None]`; grammar exercises gain `credits: list[float | None]` and `tiers: list[str | None]`. `submit_grammar_answer` treats `accent` tier as correct-for-advancement but stores 0.8 credit; the returned session includes a per-answer `feedback_note` message naming the accented form.

- [ ] **Step 1: Write the failing tests** (append to `tests/test_sessions.py`)

```python
from app.sessions import submit_grammar_answer


@pytest_asyncio.fixture
async def active_grammar_session(db) -> dict:
    """An in-progress grammar session in exercise phase, 2 exercises."""
    session = {
        "id": f"test-gram-{uuid.uuid4().hex[:8]}",
        "user_id": "matt",
        "mode": "grammar",
        "topic": "noun_cases",
        "difficulty": "beginner",
        "completed": False,
        "created_at": "2025-01-15T10:00:00+00:00",
        "exercises": {
            "type": "grammar",
            "lesson": {"concept": "Accusative Case", "explanation": "", "examples": [], "table": None},
            "exercises": [
                {"sentence": "Vidím ____.", "blank": "vidím", "hint": None, "explanation": ""},
                {"sentence": "Mám ____.", "blank": "knihu", "hint": None, "explanation": ""},
            ],
            "currentIndex": 0,
            "answers": [None, None],
            "correct": [None, None],
            "credits": [None, None],
            "tiers": [None, None],
            "phase": "exercises",
        },
        "feedback": None,
        "messages": [],
    }
    await db_create_session(db, session)
    return session


class TestGrammarPartialCredit:
    async def test_exact_answer_full_credit(self, db, active_grammar_session):
        result = await submit_grammar_answer(db, active_grammar_session["id"], "vidím")
        ex = result["exercises"]
        assert ex["correct"][0] is True
        assert ex["credits"][0] == 1.0
        assert ex["tiers"][0] == "exact"

    async def test_accent_miss_partial_credit(self, db, active_grammar_session):
        result = await submit_grammar_answer(db, active_grammar_session["id"], "vidim")
        ex = result["exercises"]
        assert ex["correct"][0] is True  # counts as correct for advancement
        assert ex["credits"][0] == 0.8
        assert ex["tiers"][0] == "accent"
        # transcript notes the accented form
        assert "vidím" in result["messages"][-1]["content"]

    async def test_wrong_answer_zero_credit(self, db, active_grammar_session):
        result = await submit_grammar_answer(db, active_grammar_session["id"], "vidiel")
        ex = result["exercises"]
        assert ex["correct"][0] is False
        assert ex["credits"][0] == 0.0
        assert ex["tiers"][0] == "wrong"

    async def test_legacy_session_without_credit_arrays(self, db, active_grammar_session):
        # Simulate a pre-migration session: strip the new arrays
        from app.database import get_session as db_get_session, update_session as db_update_session

        session = await db_get_session(db, active_grammar_session["id"])
        ex = session["exercises"]
        del ex["credits"]
        del ex["tiers"]
        await db_update_session(db, session["id"], exercises_json=ex)

        result = await submit_grammar_answer(db, session["id"], "vidím")
        assert result["exercises"]["credits"][0] == 1.0


class TestVocabCredits:
    async def test_first_try_correct_credit_1(self, db, active_vocab_session):
        result = await submit_vocab_answer(db, active_vocab_session["id"], 0)
        assert result["exercises"]["credits"][0] == 1.0

    async def test_wrong_then_retry_recovery_credit_half(self, db, active_vocab_session):
        sid = active_vocab_session["id"]
        await submit_vocab_answer(db, sid, 1)   # q0 wrong (correct is 0)
        await submit_vocab_answer(db, sid, 1)   # q1 correct (correct is 1) -> retry phase
        result = await submit_vocab_answer(db, sid, 0)  # retry q0, now correct
        ex = result["exercises"]
        assert ex["credits"][0] == 0.5
        assert ex["credits"][1] == 1.0
        assert ex["phase"] == "complete"
```

- [ ] **Step 2: Verify RED**

Run: `.venv/bin/python -m pytest tests/test_sessions.py -q`
Expected: new tests FAIL (`KeyError: 'credits'`).

- [ ] **Step 3: Implement**

In `app/sessions.py`:

Add import near the other app imports:
```python
from .scoring import grade_answer
```

In `_create_vocab_session`, extend the exercises dict:
```python
    exercises = {
        "type": "vocabulary",
        "questions": questions,
        "currentIndex": 0,
        "answers": [None] * len(questions),
        "credits": [None] * len(questions),
        "retryQueue": [],
        "phase": "questions",
    }
```

In `_create_grammar_session`, extend the exercises dict:
```python
        "currentIndex": 0,
        "answers": [None] * len(exercise_list),
        "correct": [None] * len(exercise_list),
        "credits": [None] * len(exercise_list),
        "tiers": [None] * len(exercise_list),
        "phase": "lesson",
```

In `submit_vocab_answer`, after the bounds check and `is_correct` line, replace `ex["answers"][idx] = choice_index` with:
```python
    ex["answers"][idx] = choice_index
    credits = ex.setdefault("credits", [None] * len(questions))
    if ex["phase"] == "questions":
        credits[idx] = 1.0 if is_correct else 0.0
    elif ex["phase"] == "retry" and is_correct and credits[idx] == 0.0:
        credits[idx] = 0.5  # recovered on retry
```

In `submit_grammar_answer`, replace the exact-match block:
```python
    correct_answer = exercises[idx]["blank"]
    grade = grade_answer(correct_answer, answer)
    is_correct = grade.tier in ("exact", "accent")

    ex["answers"][idx] = answer
    ex["correct"][idx] = is_correct
    ex.setdefault("credits", [None] * len(exercises))[idx] = grade.credit
    ex.setdefault("tiers", [None] * len(exercises))[idx] = grade.tier

    # Synthetic message
    if grade.tier == "accent":
        note = f"Answer: {answer} (almost — watch the diacritics: {correct_answer})"
    elif is_correct:
        note = f"Answer: {answer} (correct)"
    else:
        note = f"Answer: {answer} (incorrect, correct: {correct_answer})"
    session["messages"].append({"role": "student", "content": note})
```
(Remove the old `is_correct = answer.strip().lower() == ...` line and old message append.)

In `app/models.py`:
```python
class VocabExerciseData(BaseModel):
    type: Literal["vocabulary"] = "vocabulary"
    questions: list[VocabQuestion]
    currentIndex: int = 0
    answers: list[int | None] = []
    credits: list[float | None] = []
    retryQueue: list[int] = []
    phase: str = "questions"  # "questions" | "retry" | "complete"
```
```python
class GrammarExerciseData(BaseModel):
    type: Literal["grammar"] = "grammar"
    lesson: GrammarLesson
    exercises: list[GrammarExercise]
    currentIndex: int = 0
    answers: list[str | None] = []
    correct: list[bool | None] = []
    credits: list[float | None] = []
    tiers: list[str | None] = []
    phase: str = "lesson"  # "lesson" | "exercises" | "complete"
```

- [ ] **Step 4: Verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_sessions.py tests/ -q` — expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/sessions.py app/models.py tests/test_sessions.py
git commit -m "feat: store per-answer credits and tiers with accent partial credit"
```

---

### Task 4: Computed score in `end_session`; narrative-only feedback prompt

**Files:**
- Modify: `app/sessions.py` (`end_session`)
- Modify: `app/prompts.py` (`FEEDBACK_PROMPT`)
- Test: `tests/test_feedback.py` (create)

**Interfaces:**
- Consumes: `compute_session_score`, `compute_category_scores` (Task 2).
- Produces: feedback dict keeps the exact same shape (`overall_score`, `scores`, `strengths`, `improvements`, `sample_answer`, `vocabulary_learned`, `grammar_notes`) — frontend unaffected. For vocab/grammar/translation: `overall_score` and `scores` computed; LLM supplies the rest. Conversation: unchanged full-LLM path.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_feedback.py
"""end_session: computed scores for objective modes, LLM narrative only."""

from __future__ import annotations

import uuid

import pytest

from app import sessions as sessions_module
from app.database import create_session as db_create_session
from app.sessions import end_session


pytestmark = pytest.mark.asyncio


NARRATIVE_ONLY = {
    "strengths": ["Good recall"],
    "improvements": ["Practice diacritics"],
    "sample_answer": None,
    "vocabulary_learned": [{"slovak": "chlieb", "english": "bread", "example": None}],
    "grammar_notes": [],
}

FULL_LLM = {
    "overall_score": 6.5,
    "scores": [{"category": "Fluency", "score": 7, "comment": "ok"}],
    **NARRATIVE_ONLY,
}


@pytest.fixture
def fake_llm(monkeypatch):
    captured = {}

    async def fake_ask_json(prompt, system_prompt=None):
        captured["prompt"] = prompt
        captured["system"] = system_prompt
        return dict(FULL_LLM)

    monkeypatch.setattr(sessions_module, "ask_json", fake_ask_json)
    return captured


async def test_vocab_score_computed_not_llm(db, fake_llm, sample_vocab_session):
    session = {
        **sample_vocab_session,
        "id": f"fb-{uuid.uuid4().hex[:8]}",
        "completed": False,
        "feedback": None,
    }
    # 3 questions: answers [0,1,0] vs correctIndex [0,1,1] -> 2/3 correct
    await db_create_session(db, session)
    feedback = await end_session(db, session["id"])
    assert feedback["overall_score"] == 6.67  # (1+1+0)/3*10 rounded
    # categories computed deterministically, not the LLM's "Fluency"
    assert all(s["category"] != "Fluency" for s in feedback["scores"])
    assert feedback["strengths"] == ["Good recall"]  # narrative from LLM


async def test_conversation_score_still_from_llm(db, fake_llm, sample_conversation_session):
    session = {
        **sample_conversation_session,
        "id": f"fb-{uuid.uuid4().hex[:8]}",
        "completed": False,
        "feedback": None,
    }
    await db_create_session(db, session)
    feedback = await end_session(db, session["id"])
    assert feedback["overall_score"] == 6.5
    assert feedback["scores"][0]["category"] == "Fluency"
```

- [ ] **Step 2: Verify RED**

Run: `.venv/bin/python -m pytest tests/test_feedback.py -q`
Expected: `test_vocab_score_computed_not_llm` FAILS (score is 6.5 from LLM, not 6.67).

- [ ] **Step 3: Implement**

In `app/sessions.py`, import and rework `end_session`:
```python
from .scoring import compute_category_scores, compute_session_score, grade_answer
```

In `end_session`, replace the `feedback = {...}` construction with:
```python
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
```

In `app/prompts.py`, replace `FEEDBACK_PROMPT` with:
```python
FEEDBACK_PROMPT = f"""{ACCURACY}

Analyze this Slovak language learning session and provide narrative feedback.

NOTE: The numeric score is computed by the app from the student's actual answers.
For vocabulary/grammar/translation sessions your overall_score and scores are
IGNORED — focus on the narrative fields. For conversation sessions your
overall_score and scores ARE used: score fluency, vocabulary range, grammar
accuracy, and cultural awareness based solely on the student's messages.

You MUST respond with valid JSON in this exact format:
{{
  "overall_score": <number 1-10, used only for conversation sessions>,
  "scores": [
    {{"category": "<category name>", "score": <number 1-10>, "comment": "<specific feedback>"}}
  ],
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "improvements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"],
  "sample_answer": "<a model response to the main exercise in the session, or null>",
  "vocabulary_learned": [
    {{"slovak": "<word>", "english": "<translation>", "example": "<example sentence or null>"}}
  ],
  "grammar_notes": ["<grammar point covered>", "<another grammar point>"]
}}

Rules:
- Strengths and improvements must reference specific answers the student gave,
  not meta-commentary about the session design.
- If answers show diacritic-only misses (marked "almost — watch the diacritics"),
  include one improvement about writing the accent marks.
- For vocabulary_learned, list every new Slovak word introduced in the session.
- Be encouraging but honest. Give specific, actionable tips."""
```

- [ ] **Step 4: Verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_feedback.py tests/ -q` — expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/sessions.py app/prompts.py tests/test_feedback.py
git commit -m "feat: compute session scores in backend, demote llm to narrative feedback"
```

---

### Task 5: SRS scheduling on vocabulary progress

**Files:**
- Modify: `app/database.py` (`init_db`, `upsert_vocab_progress`; new `get_due_words`)
- Test: `tests/test_srs.py` (create)

**Interfaces:**
- Produces:
  - `vocabulary_progress` gains `due_at TEXT`, `interval_days REAL DEFAULT 1` (migration).
  - `upsert_vocab_progress` sets: correct → `interval_days = min(interval_days * 2.5, 60)`, `due_at = now + interval`; wrong → `interval_days = 1`, `due_at = now`. New rows start `interval_days = 1`; `due_at = now + 1 day` if correct else `now`.
  - `get_due_words(db, user_id: str, limit: int = 20) -> list[dict]` — rows where `due_at <= now`, weakest-accuracy first.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_srs.py
"""Spaced-repetition scheduling on vocabulary_progress."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.database import get_db, get_due_words, get_vocab_progress, upsert_vocab_progress


pytestmark = pytest.mark.asyncio


def _word(slovak, correct):
    return {"slovak": slovak, "english": "x", "correct": correct, "source_mode": "vocabulary"}


async def _row(db, user_id, slovak):
    cursor = await db.execute(
        "SELECT slovak, due_at, interval_days FROM vocabulary_progress WHERE user_id = ? AND slovak = ?",
        (user_id, slovak),
    )
    return dict(await cursor.fetchone())


async def test_new_correct_word_due_tomorrow(db):
    uid = f"srs_{uuid.uuid4().hex[:8]}"
    await upsert_vocab_progress(db, uid, [_word("chlieb", True)])
    row = await _row(db, uid, "chlieb")
    assert row["interval_days"] == 1
    due = datetime.fromisoformat(row["due_at"])
    assert due > datetime.now(timezone.utc) + timedelta(hours=12)


async def test_new_wrong_word_due_now(db):
    uid = f"srs_{uuid.uuid4().hex[:8]}"
    await upsert_vocab_progress(db, uid, [_word("voda", False)])
    row = await _row(db, uid, "voda")
    due = datetime.fromisoformat(row["due_at"])
    assert due <= datetime.now(timezone.utc)


async def test_repeat_correct_grows_interval(db):
    uid = f"srs_{uuid.uuid4().hex[:8]}"
    await upsert_vocab_progress(db, uid, [_word("mäso", True)])
    await upsert_vocab_progress(db, uid, [_word("mäso", True)])
    row = await _row(db, uid, "mäso")
    assert row["interval_days"] == 2.5


async def test_wrong_answer_resets_interval(db):
    uid = f"srs_{uuid.uuid4().hex[:8]}"
    await upsert_vocab_progress(db, uid, [_word("pivo", True)])
    await upsert_vocab_progress(db, uid, [_word("pivo", True)])
    await upsert_vocab_progress(db, uid, [_word("pivo", False)])
    row = await _row(db, uid, "pivo")
    assert row["interval_days"] == 1


async def test_interval_capped_at_60(db):
    uid = f"srs_{uuid.uuid4().hex[:8]}"
    for _ in range(10):
        await upsert_vocab_progress(db, uid, [_word("syr", True)])
    row = await _row(db, uid, "syr")
    assert row["interval_days"] == 60


async def test_get_due_words(db):
    uid = f"srs_{uuid.uuid4().hex[:8]}"
    await upsert_vocab_progress(db, uid, [_word("zlý", False), _word("dobrý", True)])
    due = await get_due_words(db, uid)
    slovaks = [w["slovak"] for w in due]
    assert "zlý" in slovaks       # wrong -> due now
    assert "dobrý" not in slovaks  # correct -> due tomorrow
```

- [ ] **Step 2: Verify RED**

Run: `.venv/bin/python -m pytest tests/test_srs.py -q`
Expected: FAIL — `no such column: due_at` / `ImportError: get_due_words`

- [ ] **Step 3: Implement**

In `init_db()` after the `pin_hash` migration block:
```python
        # Migration: SRS columns on vocabulary_progress
        for ddl in (
            "ALTER TABLE vocabulary_progress ADD COLUMN due_at TEXT",
            "ALTER TABLE vocabulary_progress ADD COLUMN interval_days REAL DEFAULT 1",
        ):
            try:
                await db.execute(ddl)
            except Exception:
                pass  # Column already exists
```

Rewrite `upsert_vocab_progress`:
```python
async def upsert_vocab_progress(
    db: aiosqlite.Connection,
    user_id: str,
    words: list[dict],
) -> None:
    """Insert or update vocabulary progress with SRS scheduling.

    Correct answers grow the review interval (x2.5, capped at 60 days);
    wrong answers reset it to 1 day and mark the word due immediately.
    """
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    for w in words:
        slovak = w["slovak"].strip().lower()
        english = w["english"].strip().lower()
        correct = bool(w.get("correct", False))
        correct_int = int(correct)
        if not slovak:
            continue

        cursor = await db.execute(
            "SELECT interval_days FROM vocabulary_progress WHERE user_id = ? AND slovak = ?",
            (user_id, slovak),
        )
        row = await cursor.fetchone()
        prev_interval = row["interval_days"] if row and row["interval_days"] else 1.0

        if correct:
            interval = min((prev_interval if row else 0.4) * 2.5, 60.0)
            due_at = (now_dt + timedelta(days=interval)).isoformat()
        else:
            interval = 1.0
            due_at = now

        await db.execute(
            """INSERT INTO vocabulary_progress
               (user_id, slovak, english, times_seen, times_correct, last_seen_at,
                source_mode, created_at, due_at, interval_days)
               VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id, slovak) DO UPDATE SET
                   times_seen = times_seen + 1,
                   times_correct = times_correct + ?,
                   last_seen_at = ?,
                   due_at = ?,
                   interval_days = ?,
                   english = CASE WHEN excluded.english != '' THEN excluded.english ELSE english END""",
            (user_id, slovak, english, correct_int, now, w["source_mode"], now,
             due_at, interval, correct_int, now, due_at, interval),
        )
    await db.commit()
```
(Note: `(prev_interval if row else 0.4) * 2.5` makes a brand-new correct word land on exactly 1.0 day, matching the test.)

Add after `get_weak_words`:
```python
async def get_due_words(db: aiosqlite.Connection, user_id: str, limit: int = 20) -> list[dict]:
    """Words due for review now, weakest accuracy first."""
    now = datetime.now(timezone.utc).isoformat()
    cursor = await db.execute(
        """SELECT slovak, english, times_seen, times_correct, last_seen_at, source_mode, due_at
           FROM vocabulary_progress
           WHERE user_id = ? AND due_at IS NOT NULL AND due_at <= ?
           ORDER BY CAST(times_correct AS REAL) / MAX(times_seen, 1) ASC, due_at ASC
           LIMIT ?""",
        (user_id, now, limit),
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]
```

- [ ] **Step 4: Verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_srs.py tests/ -q` — expected: all pass (existing vocab tests unaffected — they don't inspect due_at).

- [ ] **Step 5: Commit**

```bash
git add app/database.py tests/test_srs.py
git commit -m "feat: add spaced-repetition scheduling to vocabulary progress"
```

---

### Task 6: Concept mastery tracking

**Files:**
- Modify: `app/database.py` (schema + helpers), `app/sessions.py` (`end_session`)
- Test: `tests/test_concepts.py` (create)

**Interfaces:**
- Produces:
  - Table `concept_progress(user_id TEXT, concept TEXT, times_seen INTEGER, times_correct REAL, last_seen_at TEXT, PRIMARY KEY(user_id, concept))`.
  - `record_concept_result(db, user_id, concept, credits: list[float]) -> None` — adds `len(credits)` to times_seen and `sum(credits)` to times_correct.
  - `get_weakest_concepts(db, user_id, limit=3) -> list[dict]` — `[{"concept", "accuracy", "times_seen"}]`, lowest accuracy first, only concepts with `times_seen >= 3`.
  - `end_session` calls `record_concept_result` for completed grammar sessions using `exercises["lesson"]["concept"]` and `exercises["credits"]`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_concepts.py
"""Grammar concept mastery tracking."""

from __future__ import annotations

import uuid

import pytest

from app.database import get_weakest_concepts, record_concept_result


pytestmark = pytest.mark.asyncio


async def test_record_and_rank_weakest(db):
    uid = f"cp_{uuid.uuid4().hex[:8]}"
    await record_concept_result(db, uid, "Accusative case", [1.0, 0.0, 0.0, 1.0])   # 50%
    await record_concept_result(db, uid, "Present tense", [1.0, 1.0, 1.0])          # 100%
    weakest = await get_weakest_concepts(db, uid)
    assert weakest[0]["concept"] == "Accusative case"
    assert weakest[0]["accuracy"] == 0.5


async def test_accumulates_across_sessions(db):
    uid = f"cp_{uuid.uuid4().hex[:8]}"
    await record_concept_result(db, uid, "Locative case", [1.0, 1.0])
    await record_concept_result(db, uid, "Locative case", [0.0, 0.0])
    weakest = await get_weakest_concepts(db, uid)
    assert weakest[0]["times_seen"] == 4
    assert weakest[0]["accuracy"] == 0.5


async def test_low_sample_concepts_excluded(db):
    uid = f"cp_{uuid.uuid4().hex[:8]}"
    await record_concept_result(db, uid, "Vocative", [0.0])  # only 1 sample
    assert await get_weakest_concepts(db, uid) == []


async def test_partial_credit_counts_fractionally(db):
    uid = f"cp_{uuid.uuid4().hex[:8]}"
    await record_concept_result(db, uid, "Diacritics", [0.8, 0.8, 0.8])
    weakest = await get_weakest_concepts(db, uid)
    assert weakest[0]["accuracy"] == 0.8
```

- [ ] **Step 2: Verify RED**

Run: `.venv/bin/python -m pytest tests/test_concepts.py -q`
Expected: ImportError.

- [ ] **Step 3: Implement**

In `init_db()`, after the pack_purchases index:
```python
        await db.execute("""
            CREATE TABLE IF NOT EXISTS concept_progress (
                user_id TEXT NOT NULL REFERENCES users(id),
                concept TEXT NOT NULL,
                times_seen INTEGER NOT NULL DEFAULT 0,
                times_correct REAL NOT NULL DEFAULT 0,
                last_seen_at TEXT NOT NULL,
                PRIMARY KEY (user_id, concept)
            )
        """)
```

In `app/database.py`, after `get_due_words`:
```python
# ── Concept Progress ────────────────────────────────────────────────


async def record_concept_result(
    db: aiosqlite.Connection, user_id: str, concept: str, credits: list[float]
) -> None:
    """Accumulate grammar-concept results (fractional credit supported)."""
    concept = concept.strip()
    if not concept or not credits:
        return
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        """INSERT INTO concept_progress (user_id, concept, times_seen, times_correct, last_seen_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, concept) DO UPDATE SET
               times_seen = times_seen + ?,
               times_correct = times_correct + ?,
               last_seen_at = ?""",
        (user_id, concept, len(credits), sum(credits), now,
         len(credits), sum(credits), now),
    )
    await db.commit()


async def get_weakest_concepts(
    db: aiosqlite.Connection, user_id: str, limit: int = 3
) -> list[dict]:
    """Concepts with lowest accuracy (min 3 samples), weakest first."""
    cursor = await db.execute(
        """SELECT concept, times_seen, times_correct,
                  times_correct / MAX(times_seen, 1) AS accuracy
           FROM concept_progress
           WHERE user_id = ? AND times_seen >= 3
           ORDER BY accuracy ASC
           LIMIT ?""",
        (user_id, limit),
    )
    rows = await cursor.fetchall()
    return [
        {"concept": r["concept"], "accuracy": round(r["accuracy"], 2), "times_seen": r["times_seen"]}
        for r in rows
    ]
```

In `app/sessions.py` `end_session`, inside the existing vocab-extraction `try` block (after `upsert_vocab_progress`), add:
```python
            ex = session_with_feedback.get("exercises") or {}
            if ex.get("type") == "grammar":
                concept = (ex.get("lesson") or {}).get("concept", "")
                credits = [c for c in (ex.get("credits") or []) if c is not None]
                if concept and credits:
                    await record_concept_result(db, session_with_feedback["user_id"], concept, credits)
```
and import `record_concept_result` in the database import list.

- [ ] **Step 4: Verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_concepts.py tests/ -q` — all pass.

- [ ] **Step 5: Commit**

```bash
git add app/database.py app/sessions.py tests/test_concepts.py
git commit -m "feat: track grammar concept mastery from session results"
```

---

### Task 7: Recommendations endpoint

**Files:**
- Modify: `app/main.py`
- Test: `tests/test_recommendations.py` (create)

**Interfaces:**
- Consumes: `get_due_words` (Task 5), `get_weakest_concepts` (Task 6), `list_sessions`.
- Produces: `GET /api/users/{user_id}/recommendations` →
  ```json
  {
    "in_progress_session": {"id", "mode", "topic", "difficulty", "created_at"} | null,
    "due_words": <int>,
    "weakest_concept": {"concept", "accuracy", "times_seen"} | null,
    "recommended": [
      {"kind": "continue", "label": "Continue Grammar · Noun Cases", "mode": "grammar", "session_id": "..."},
      {"kind": "review_vocab", "label": "Review 8 due words", "mode": "vocabulary"},
      {"kind": "practice_concept", "label": "Practice: Accusative case", "mode": "grammar"}
    ]
  }
  ```
  Order: continue → review_vocab (if ≥3 due) → practice_concept (if accuracy < 0.7). 404 for unknown user.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_recommendations.py
"""GET /api/users/{id}/recommendations."""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import (
    create_session as db_create_session,
    get_db,
    record_concept_result,
    upsert_vocab_progress,
)
from app.main import app


@pytest.fixture
def client(_init_schema):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


def _fresh_uid():
    return f"rec_{uuid.uuid4().hex[:8]}"


async def _seed_user(uid):
    """Recommendations require an existing user row."""
    async with get_db() as db:
        await db.execute(
            "INSERT OR IGNORE INTO users (id, name, avatar, color) VALUES (?, 'R', 'R', '#000')",
            (uid,),
        )
        await db.commit()


@pytest.mark.asyncio
class TestRecommendations:
    async def test_unknown_user_404(self, client):
        async with client as c:
            resp = await c.get("/api/users/no_such_user/recommendations")
        assert resp.status_code == 404

    async def test_empty_user_gets_empty_recommendations(self, client):
        uid = _fresh_uid()
        await _seed_user(uid)
        async with client as c:
            resp = await c.get(f"/api/users/{uid}/recommendations")
        assert resp.status_code == 200
        data = resp.json()
        assert data["in_progress_session"] is None
        assert data["due_words"] == 0
        assert data["recommended"] == []

    async def test_due_words_recommendation(self, client):
        uid = _fresh_uid()
        await _seed_user(uid)
        async with get_db() as db:
            words = [
                {"slovak": f"w{i}", "english": "x", "correct": False, "source_mode": "vocabulary"}
                for i in range(4)
            ]
            await upsert_vocab_progress(db, uid, words)
        async with client as c:
            resp = await c.get(f"/api/users/{uid}/recommendations")
        data = resp.json()
        assert data["due_words"] == 4
        kinds = [r["kind"] for r in data["recommended"]]
        assert "review_vocab" in kinds

    async def test_weak_concept_recommendation(self, client):
        uid = _fresh_uid()
        await _seed_user(uid)
        async with get_db() as db:
            await record_concept_result(db, uid, "Accusative case", [0.0, 0.0, 1.0])
        async with client as c:
            resp = await c.get(f"/api/users/{uid}/recommendations")
        data = resp.json()
        assert data["weakest_concept"]["concept"] == "Accusative case"
        kinds = [r["kind"] for r in data["recommended"]]
        assert "practice_concept" in kinds

    async def test_in_progress_session_first(self, client):
        uid = _fresh_uid()
        await _seed_user(uid)
        session = {
            "id": f"rec-{uuid.uuid4().hex[:8]}", "user_id": uid, "mode": "grammar",
            "topic": "noun_cases", "difficulty": "beginner", "completed": False,
            "created_at": "2026-07-17T10:00:00+00:00",
            "exercises": {"type": "grammar", "lesson": {"concept": "X", "explanation": "", "examples": []},
                          "exercises": [{}], "currentIndex": 0, "answers": [None],
                          "correct": [None], "credits": [None], "tiers": [None], "phase": "exercises"},
            "feedback": None, "messages": [],
        }
        async with get_db() as db:
            await db_create_session(db, session)
        async with client as c:
            resp = await c.get(f"/api/users/{uid}/recommendations")
        data = resp.json()
        assert data["in_progress_session"]["id"] == session["id"]
        assert data["recommended"][0]["kind"] == "continue"
```

- [ ] **Step 2: Verify RED**

Run: `.venv/bin/python -m pytest tests/test_recommendations.py -q`
Expected: 404s → FAIL (route doesn't exist).

- [ ] **Step 3: Implement** (in `app/main.py`, after the vocabulary endpoint; extend the database import list with `get_due_words`, `get_weakest_concepts`)

```python
@app.get("/api/users/{user_id}/recommendations")
async def recommendations(user_id: str):
    async with get_db() as db:
        if not await get_user(db, user_id):
            raise HTTPException(404, "User not found")

        sessions = await list_sessions(db, user_id)
        in_progress = next((s for s in sessions if not s["completed"]), None)
        due = await get_due_words(db, user_id, limit=20)
        weakest = await get_weakest_concepts(db, user_id, limit=1)
        weakest_concept = weakest[0] if weakest else None

        recommended: list[dict] = []
        if in_progress:
            topic_label = TOPICS.get(in_progress["mode"], {}).get(
                in_progress["topic"], in_progress["topic"]
            )
            recommended.append({
                "kind": "continue",
                "label": f"Continue {in_progress['mode'].title()} · {topic_label}",
                "mode": in_progress["mode"],
                "session_id": in_progress["id"],
            })
        if len(due) >= 3:
            recommended.append({
                "kind": "review_vocab",
                "label": f"Review {len(due)} due words",
                "mode": "vocabulary",
            })
        if weakest_concept and weakest_concept["accuracy"] < 0.7:
            recommended.append({
                "kind": "practice_concept",
                "label": f"Practice: {weakest_concept['concept']}",
                "mode": "grammar",
            })

        in_progress_summary = None
        if in_progress:
            in_progress_summary = {
                "id": in_progress["id"],
                "mode": in_progress["mode"],
                "topic": in_progress["topic"],
                "difficulty": in_progress["difficulty"],
                "created_at": in_progress["created_at"],
            }

        return {
            "in_progress_session": in_progress_summary,
            "due_words": len(due),
            "weakest_concept": weakest_concept,
            "recommended": recommended,
        }
```

- [ ] **Step 4: Verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_recommendations.py tests/ -q` — all pass.

- [ ] **Step 5: Commit**

```bash
git add app/main.py tests/test_recommendations.py
git commit -m "feat: add recommendations endpoint (continue, due words, weak concepts)"
```

---

### Task 8: Generation prefers due words / weakest concept

**Files:**
- Modify: `app/sessions.py` (`_create_vocab_session`, `_create_grammar_session`)
- Test: `tests/test_generation_targeting.py` (create)

**Interfaces:**
- Consumes: `get_due_words`, `get_weakest_concepts`.
- Produces: vocab prompt includes a "review these due words" block (up to 6 due words); grammar prompt targets the weakest concept when topic is `"general"` and no focus areas.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_generation_targeting.py
"""Session generation targets due words and weak concepts."""

from __future__ import annotations

import uuid

import pytest

from app import sessions as sessions_module
from app.database import record_concept_result, upsert_vocab_progress
from app.sessions import _create_grammar_session, _create_vocab_session


pytestmark = pytest.mark.asyncio


@pytest.fixture
def capture_llm(monkeypatch):
    captured = {}

    async def fake_ask_json(prompt, system_prompt=None):
        captured["prompt"] = prompt
        return {"questions": [], "lesson": {"concept": "X", "explanation": "", "examples": []}, "exercises": []}

    monkeypatch.setattr(sessions_module, "ask_json", fake_ask_json)
    return captured


async def _seed_user(db, uid):
    await db.execute(
        "INSERT OR IGNORE INTO users (id, name, avatar, color) VALUES (?, 'T', 'T', '#000')",
        (uid,),
    )
    await db.commit()


async def test_vocab_prompt_includes_due_words(db, capture_llm):
    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
    ])
    await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    assert "hrad" in capture_llm["prompt"]
    assert "due for review" in capture_llm["prompt"]


async def test_vocab_prompt_no_due_block_when_none_due(db, capture_llm):
    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    assert "due for review" not in capture_llm["prompt"]


async def test_grammar_targets_weakest_concept_on_general_topic(db, capture_llm):
    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await record_concept_result(db, uid, "Accusative case", [0.0, 0.0, 1.0])
    await _create_grammar_session(db, {"user_id": uid, "mode": "grammar", "topic": "general"})
    assert "Accusative case" in capture_llm["prompt"]


async def test_grammar_explicit_topic_not_overridden(db, capture_llm):
    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await record_concept_result(db, uid, "Accusative case", [0.0, 0.0, 1.0])
    await _create_grammar_session(db, {"user_id": uid, "mode": "grammar", "topic": "verb_conjugation"})
    assert "Accusative case" not in capture_llm["prompt"]
```

- [ ] **Step 2: Verify RED**

Run: `.venv/bin/python -m pytest tests/test_generation_targeting.py -q`
Expected: FAIL on the due-words / weakest-concept assertions.

- [ ] **Step 3: Implement**

In `app/sessions.py`, extend the database import list with `get_due_words, get_weakest_concepts`.

In `_create_vocab_session`, after the `learning_context` line, add:
```python
    due_words = await get_due_words(db, req["user_id"], limit=6)
```
and after the base `prompt +=` generation block, add:
```python
    if due_words:
        due_list = ", ".join(
            f"{w['slovak']} ({w['english']})" if w.get("english") else w["slovak"]
            for w in due_words
        )
        prompt += (
            f"\n\nPRIORITY — these words are due for review; include as many as fit "
            f"the topic (at least {min(len(due_words), 4)}): {due_list}"
        )
```

In `_create_grammar_session`, after the `focus_areas` line, add:
```python
    target_concept = None
    if req.get("topic", "general") == "general" and not focus_areas:
        weakest = await get_weakest_concepts(db, req["user_id"], limit=1)
        if weakest and weakest[0]["accuracy"] < 0.7:
            target_concept = weakest[0]["concept"]
```
and after the base `prompt +=` block, add:
```python
    if target_concept:
        prompt += (
            f"\n\nTARGET CONCEPT: The student's weakest concept is '{target_concept}' "
            f"— build this lesson on that concept."
        )
```

- [ ] **Step 4: Verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_generation_targeting.py tests/ -q` — all pass.

- [ ] **Step 5: Commit**

```bash
git add app/sessions.py tests/test_generation_targeting.py
git commit -m "feat: target due words and weakest concepts in session generation"
```

---

### Task 9: Card copies, 5-card packs, rare+ guarantee, mythic rarity

**Files:**
- Modify: `app/database.py` (`init_db`, `add_user_cards`, `purchase_pack`), `app/cards.py`
- Test: `tests/test_pack_mechanics.py` (create)

**Interfaces:**
- Produces:
  - `card_collection` gains `copies INTEGER DEFAULT 1`; `add_user_cards` increments `copies` on duplicates (still returns only first-copy ids).
  - `get_user_card_copies(db, user_id) -> dict[int, int]` — card_id → copies.
  - `purchase_pack` deals `PACK_SIZE = 5` cards with ≥1 rare/legendary/mythic; weights `{"common": 50, "uncommon": 30, "rare": 15, "legendary": 4, "mythic": 1}`; result dict gains `"copies"` map for dealt cards.
  - `app/cards.py`: one mythic card per set, ids 151–160, `number: 16`, `rarity: "mythic"`. `CardDef.rarity` comment updated.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_pack_mechanics.py
"""Pack dealing: 5 cards, rare+ guarantee, mythic, duplicate copies."""

from __future__ import annotations

import uuid

import pytest

from app.cards import CARDS, CARDS_BY_SET
from app.database import (
    add_user_cards,
    create_session as db_create_session,
    get_db,
    get_user_card_copies,
    purchase_pack,
)


pytestmark = pytest.mark.asyncio

RARE_PLUS = {"rare", "legendary", "mythic"}


def test_every_set_has_a_mythic():
    for set_id, cards in CARDS_BY_SET.items():
        rarities = [c["rarity"] for c in cards]
        assert "mythic" in rarities, f"set {set_id} missing mythic"


def test_mythic_ids_and_numbers():
    mythics = [c for c in CARDS if c["rarity"] == "mythic"]
    assert len(mythics) == 10
    assert all(c["number"] == 16 for c in mythics)
    assert sorted(c["id"] for c in mythics) == list(range(151, 161))


async def _seed_rich_user(sample_vocab_session):
    """User with plenty of XP (10 completed sessions = 310 XP)."""
    uid = f"pack_{uuid.uuid4().hex[:8]}"
    async with get_db() as db:
        for _ in range(10):
            await db_create_session(db, {
                **sample_vocab_session, "id": f"pk-{uuid.uuid4().hex[:8]}", "user_id": uid,
            })
    return uid


async def test_pack_deals_five_cards(sample_vocab_session, _init_schema):
    uid = await _seed_rich_user(sample_vocab_session)
    async with get_db() as db:
        result = await purchase_pack(db, uid, "myty")
    assert result is not None
    assert len(result["cards"]) == 5


async def test_pack_guarantees_rare_or_better(sample_vocab_session, _init_schema):
    uid = await _seed_rich_user(sample_vocab_session)
    async with get_db() as db:
        result = await purchase_pack(db, uid, "myty")
    rarities = {c["rarity"] for c in result["cards"]}
    assert rarities & RARE_PLUS, f"no rare+ in pack: {rarities}"


async def test_duplicates_increment_copies(_init_schema):
    uid = f"copy_{uuid.uuid4().hex[:8]}"
    async with get_db() as db:
        first = await add_user_cards(db, uid, [1, 2])
        second = await add_user_cards(db, uid, [1, 3])
        await db.commit()  # add_user_cards no longer commits (caller owns txn)
        copies = await get_user_card_copies(db, uid)
    assert first == [1, 2]
    assert second == [3]          # only card 3 is new
    assert copies[1] == 2         # duplicate incremented
    assert copies[2] == 1
    assert copies[3] == 1
```

- [ ] **Step 2: Verify RED**

Run: `.venv/bin/python -m pytest tests/test_pack_mechanics.py -q`
Expected: mythic tests FAIL (no mythic cards); ImportError for `get_user_card_copies`.

- [ ] **Step 3: Implement**

**(a) `app/cards.py`** — update the rarity comment in `CardDef` to `# "common" | "uncommon" | "rare" | "legendary" | "mythic"`, then append 10 mythic cards before the `CARD_BY_ID` index. Use exactly this content for `myty` (from the approved design), and the following curated entries for the rest. **Before adding each, grep the set's existing cards for the same `slovak` value; if a word already exists in that set, use the listed alternate.**

```python
    # ── Mythic cards (1 per set, ~1% pull rate) ──────────────────────
    {
        "id": 151, "set_id": "myty", "set_name": "Mýty a Legendy", "set_emoji": "🐉",
        "emoji": "👑", "slovak": "šarkan kráľ", "pronunciation": "SHAR-kahn krahl",
        "english": "dragon king",
        "example_sk": "Sedemhlavý šarkan vládol všetkým drakom pod Tatrami.",
        "example_en": "The seven-headed dragon ruled all dragons beneath the Tatras.",
        "rarity": "mythic", "number": 16, "origin": "Slovak",
    },
    {
        "id": 152, "set_id": "jedlo", "set_name": "Slovenská Kuchyňa", "set_emoji": "🥟",
        "emoji": "🥛", "slovak": "žinčica", "pronunciation": "ZHIN-chih-tsah",
        "english": "sheep whey drink",
        "example_sk": "Bača nám na salaši ponúkol čerstvú žinčicu.",
        "example_en": "The shepherd offered us fresh sheep whey at the mountain hut.",
        "rarity": "mythic", "number": 16, "origin": "Slovak",
    },
    {
        "id": 153, "set_id": "pamiatky", "set_name": "Pamiatky", "set_emoji": "🏰",
        "emoji": "🏯", "slovak": "Devín", "pronunciation": "DYEH-veen",
        "english": "Devin Castle",
        "example_sk": "Hrad Devín stojí nad sútokom Dunaja a Moravy.",
        "example_en": "Devin Castle stands above the confluence of the Danube and Morava rivers.",
        "rarity": "mythic", "number": 16, "origin": "Slovak",
    },
    {
        "id": 154, "set_id": "slang", "set_name": "Slang & Výrazy", "set_emoji": "🗣️",
        "emoji": "😱", "slovak": "nekecaj", "pronunciation": "NYEH-keh-tsai",
        "english": "no way! / you're kidding!",
        "example_sk": "Nekecaj, to si vyhral naozaj ty?",
        "example_en": "No way, did you really win that?",
        "rarity": "mythic", "number": 16, "origin": "Czech/Slovak",
    },
    {
        "id": 155, "set_id": "rozpravky", "set_name": "Rozprávky", "set_emoji": "🧚",
        "emoji": "🦸", "slovak": "Popolvár", "pronunciation": "POH-pol-vaar",
        "english": "Popolvar (fairy-tale hero)",
        "example_sk": "Popolvár, najväčší na svete, premohol drakov a zachránil princezné.",
        "example_en": "Popolvar, the greatest in the world, defeated dragons and saved princesses.",
        "rarity": "mythic", "number": 16, "origin": "Slovak",
    },
    {
        "id": 156, "set_id": "futbal", "set_name": "Futbal", "set_emoji": "⚽",
        "emoji": "🐐", "slovak": "Marek Hamšík", "pronunciation": "MAH-rek HAM-sheek",
        "english": "Marek Hamsik (football legend)",
        "example_sk": "Marek Hamšík je rekordér v počte štartov za slovenskú reprezentáciu.",
        "example_en": "Marek Hamsik holds the record for appearances for the Slovak national team.",
        "rarity": "mythic", "number": 16, "origin": "Slovak",
    },
    {
        "id": 157, "set_id": "zvierata", "set_name": "Tatranská Fauna", "set_emoji": "🐻",
        "emoji": "🐐", "slovak": "kamzík vrchovský", "pronunciation": "KAM-zeek VRKH-ov-skee",
        "english": "Tatra chamois",
        "example_sk": "Kamzík vrchovský tatranský žije iba vo Vysokých Tatrách.",
        "example_en": "The Tatra chamois lives only in the High Tatras.",
        "rarity": "mythic", "number": 16, "origin": "Slovak",
    },
    {
        "id": 158, "set_id": "tradicie", "set_name": "Tradície", "set_emoji": "🎭",
        "emoji": "🔥", "slovak": "Morena", "pronunciation": "MOH-reh-nah",
        "english": "Morena (winter goddess effigy)",
        "example_sk": "Na jar dedinčania hádžu horiacu Morenu do rieky, aby odniesla zimu.",
        "example_en": "In spring, villagers throw the burning Morena into the river to carry winter away.",
        "rarity": "mythic", "number": 16, "origin": "Pan-Slavic",
    },
    {
        "id": 159, "set_id": "priroda", "set_name": "Slovenská Príroda", "set_emoji": "🏔️",
        "emoji": "⛰️", "slovak": "Kriváň", "pronunciation": "KRIH-vaan",
        "english": "Krivan (national symbol peak)",
        "example_sk": "Kriváň je symbolom slovenskej hrdosti a je zobrazený na eurominciach.",
        "example_en": "Krivan is a symbol of Slovak pride and appears on euro coins.",
        "rarity": "mythic", "number": 16, "origin": "Slovak",
    },
    {
        "id": 160, "set_id": "hudba", "set_name": "Hudba a Umenie", "set_emoji": "🎵",
        "emoji": "🪈", "slovak": "fujara", "pronunciation": "FOO-yah-rah",
        "english": "fujara (UNESCO shepherd's flute)",
        "example_sk": "Fujara je zapísaná v zozname svetového dedičstva UNESCO.",
        "example_en": "The fujara is inscribed on the UNESCO World Heritage list.",
        "rarity": "mythic", "number": 16, "origin": "Slovak",
    },
```
Alternates if a word already exists in its set: zvierata → `svišť` (marmot, /SVISHT/); hudba → `trombita` (long shepherd horn); priroda → `Štrbské pleso` (mountain lake); tradicie → `páranie peria` (feather-plucking gathering).

**(b) `app/database.py`** — migration in `init_db()` (next to the other migrations):
```python
        try:
            await db.execute("ALTER TABLE card_collection ADD COLUMN copies INTEGER NOT NULL DEFAULT 1")
        except Exception:
            pass  # Column already exists
```

Replace `add_user_cards` (the UNIQUE constraint stays; use UPSERT):
```python
async def add_user_cards(db: aiosqlite.Connection, user_id: str, card_ids: list[int]) -> list[int]:
    """Add cards to the collection. Duplicates increment `copies`.

    Returns only the card IDs that are NEW to the user (first copy).
    NOTE: does not commit — callers own the transaction.
    """
    new_ids = []
    for cid in card_ids:
        cursor = await db.execute(
            "SELECT copies FROM card_collection WHERE user_id = ? AND card_id = ?",
            (user_id, cid),
        )
        row = await cursor.fetchone()
        if row:
            await db.execute(
                "UPDATE card_collection SET copies = copies + 1 WHERE user_id = ? AND card_id = ?",
                (user_id, cid),
            )
        else:
            await db.execute(
                "INSERT INTO card_collection (user_id, card_id) VALUES (?, ?)",
                (user_id, cid),
            )
            new_ids.append(cid)
    return new_ids
```
**Important:** `add_user_cards` no longer commits (it runs inside `purchase_pack`'s transaction). Its only caller is `purchase_pack`, which commits — verify with `grep -rn "add_user_cards" app/ tests/`.

Add:
```python
async def get_user_card_copies(db: aiosqlite.Connection, user_id: str) -> dict[int, int]:
    """card_id -> copies owned."""
    cursor = await db.execute(
        "SELECT card_id, copies FROM card_collection WHERE user_id = ?", (user_id,)
    )
    rows = await cursor.fetchall()
    return {r["card_id"]: r["copies"] for r in rows}
```
Wait — `test_duplicates_increment_copies` calls `add_user_cards` directly and expects persistence: wrap those calls' effects by adding an explicit `await db.commit()` at the end of the test's `async with` block **in the test itself**:
```python
        second = await add_user_cards(db, uid, [1, 3])
        await db.commit()
        copies = await get_user_card_copies(db, uid)
```
(Include the commit in the test as shown when writing it in Step 1.)

Rework the dealing section of `purchase_pack` (inside the existing `BEGIN IMMEDIATE` try block). Replace from `# Pick 3 cards with rarity weighting` down to the `selected_ids` line with:
```python
        # Deal PACK_SIZE cards with rarity weighting and a rare+ guarantee
        PACK_SIZE = 5
        weights = {"common": 50, "uncommon": 30, "rare": 15, "legendary": 4, "mythic": 1}
        rare_plus = {"rare", "legendary", "mythic"}

        unowned = [c for c in set_cards if c["id"] not in owned]
        pool = unowned if len(unowned) >= PACK_SIZE else set_cards

        def _weighted_unique(source: list, k: int, exclude: set[int]) -> list:
            picked: list = []
            candidates = [c for c in source if c["id"] not in exclude]
            while candidates and len(picked) < k:
                ws = [weights.get(c["rarity"], 50) for c in candidates]
                choice = random.choices(candidates, weights=ws, k=1)[0]
                picked.append(choice)
                candidates = [c for c in candidates if c["id"] != choice["id"]]
            return picked

        unique_selected = _weighted_unique(pool, PACK_SIZE, set())

        # Guarantee at least one rare-or-better
        if not any(c["rarity"] in rare_plus for c in unique_selected):
            rare_pool = [c for c in set_cards if c["rarity"] in rare_plus]
            if rare_pool:
                ws = [weights.get(c["rarity"], 1) for c in rare_pool]
                replacement = random.choices(rare_pool, weights=ws, k=1)[0]
                if replacement["id"] not in {c["id"] for c in unique_selected[:-1]}:
                    unique_selected[-1] = replacement

        selected_ids = [c["id"] for c in unique_selected]
```
After `new_ids = await add_user_cards(...)` and before `await db.commit()`, add:
```python
        copies_map = await get_user_card_copies(db, user_id)
```
and extend the return dict with:
```python
        "copies": {cid: copies_map.get(cid, 1) for cid in selected_ids},
```

- [ ] **Step 4: Verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_pack_mechanics.py tests/test_purchases.py tests/ -q`
Expected: all pass. Note: `tests/test_purchases.py::test_sequential_pack_purchase_still_works` asserts `len(result["cards"]) > 0` — still valid with 5 cards.

- [ ] **Step 5: Commit**

```bash
git add app/cards.py app/database.py tests/test_pack_mechanics.py
git commit -m "feat: 5-card packs with rare+ guarantee, mythic rarity, duplicate copies"
```

---

### Task 10: XP adjustments + duplicate trade-in

**Files:**
- Modify: `app/database.py`, `app/main.py`, `app/models.py`
- Test: `tests/test_trade_in.py` (create)

**Interfaces:**
- Produces:
  - Table `xp_adjustments(id INTEGER PK AUTOINCREMENT, user_id TEXT, amount INTEGER, reason TEXT, created_at TEXT DEFAULT (datetime('now')))`; `_get_user_xp_earned` adds `SUM(amount)`.
  - `TRADE_IN_XP = {"common": 20, "uncommon": 40, "rare": 80, "legendary": 200, "mythic": 500}` in `app/database.py`.
  - `trade_in_duplicates(db, user_id, card_ids: list[int]) -> dict | None` — trades ONE extra copy per requested card (must own ≥2). Returns `{"traded": [...], "xp_gained": int}` or `None` if any card invalid/not duplicated. Runs in `BEGIN IMMEDIATE`.
  - `POST /api/users/{user_id}/cards/trade-in` body `{"card_ids": [int]}` (new model `TradeInRequest`), 400 on invalid.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_trade_in.py
"""Duplicate card trade-in for XP."""

from __future__ import annotations

import uuid

import pytest

from app.database import (
    _get_user_xp_earned,
    add_user_cards,
    get_db,
    get_user_card_copies,
    trade_in_duplicates,
)


pytestmark = pytest.mark.asyncio


async def _user_with_dupes():
    uid = f"trade_{uuid.uuid4().hex[:8]}"
    async with get_db() as db:
        await add_user_cards(db, uid, [1])   # card 1 = common (vodník)
        await add_user_cards(db, uid, [1])   # duplicate
        await add_user_cards(db, uid, [2])   # single copy
        await db.commit()
    return uid


async def test_trade_in_duplicate_gains_xp(_init_schema):
    uid = await _user_with_dupes()
    async with get_db() as db:
        result = await trade_in_duplicates(db, uid, [1])
        assert result == {"traded": [1], "xp_gained": 20}  # common = 20
        copies = await get_user_card_copies(db, uid)
        assert copies[1] == 1  # one copy consumed, card kept
        assert await _get_user_xp_earned(db, uid) == 20


async def test_cannot_trade_single_copy(_init_schema):
    uid = await _user_with_dupes()
    async with get_db() as db:
        assert await trade_in_duplicates(db, uid, [2]) is None


async def test_cannot_trade_unowned_card(_init_schema):
    uid = await _user_with_dupes()
    async with get_db() as db:
        assert await trade_in_duplicates(db, uid, [99]) is None


async def test_trade_in_endpoint(client_factory=None, _init_schema=None):
    pass  # replaced below — endpoint test uses httpx client
```

Also append an endpoint test (same file):
```python
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def client(_init_schema):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def test_trade_in_endpoint_success(client):
    uid = await _user_with_dupes()
    async with client as c:
        resp = await c.post(f"/api/users/{uid}/cards/trade-in", json={"card_ids": [1]})
    assert resp.status_code == 200
    assert resp.json()["xp_gained"] == 20


async def test_trade_in_endpoint_rejects_single_copy(client):
    uid = await _user_with_dupes()
    async with client as c:
        resp = await c.post(f"/api/users/{uid}/cards/trade-in", json={"card_ids": [2]})
    assert resp.status_code == 400
```
(Delete the placeholder `test_trade_in_endpoint` stub when adding these.)

- [ ] **Step 2: Verify RED**

Run: `.venv/bin/python -m pytest tests/test_trade_in.py -q`
Expected: ImportError for `trade_in_duplicates`.

- [ ] **Step 3: Implement**

`init_db()` — add table:
```python
        await db.execute("""
            CREATE TABLE IF NOT EXISTS xp_adjustments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL REFERENCES users(id),
                amount INTEGER NOT NULL,
                reason TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        await db.execute("CREATE INDEX IF NOT EXISTS idx_xpadj_user ON xp_adjustments(user_id)")
```

`_get_user_xp_earned` — add adjustments:
```python
async def _get_user_xp_earned(db: aiosqlite.Connection, user_id: str) -> int:
    """Total XP earned: completed sessions + adjustments (e.g. card trade-ins)."""
    sessions = await list_sessions(db, user_id)
    completed = [s for s in sessions if s["completed"] and s.get("feedback")]
    cursor = await db.execute(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM xp_adjustments WHERE user_id = ?",
        (user_id,),
    )
    row = await cursor.fetchone()
    return _calculate_xp(completed) + row["total"]
```

Trade-in (after `get_user_card_copies`):
```python
TRADE_IN_XP = {"common": 20, "uncommon": 40, "rare": 80, "legendary": 200, "mythic": 500}


async def trade_in_duplicates(
    db: aiosqlite.Connection, user_id: str, card_ids: list[int]
) -> dict | None:
    """Trade ONE extra copy of each listed card for XP.

    Every card must be owned with copies >= 2. Returns None if any card
    fails validation (all-or-nothing).
    """
    from .cards import CARD_BY_ID

    if not card_ids:
        return None

    await db.execute("BEGIN IMMEDIATE")
    try:
        copies = await get_user_card_copies(db, user_id)
        total_xp = 0
        for cid in card_ids:
            card = CARD_BY_ID.get(cid)
            if not card or copies.get(cid, 0) < 2:
                await db.rollback()
                return None
            total_xp += TRADE_IN_XP.get(card["rarity"], 20)

        for cid in card_ids:
            await db.execute(
                "UPDATE card_collection SET copies = copies - 1 WHERE user_id = ? AND card_id = ?",
                (user_id, cid),
            )
        await db.execute(
            "INSERT INTO xp_adjustments (user_id, amount, reason) VALUES (?, ?, ?)",
            (user_id, total_xp, f"trade-in: {len(card_ids)} card(s)"),
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return {"traded": card_ids, "xp_gained": total_xp}
```

`app/models.py`:
```python
class TradeInRequest(BaseModel):
    card_ids: Annotated[list[int], Field(min_length=1, max_length=50)]
```

`app/main.py` — import `TradeInRequest` and `trade_in_duplicates`, add after the pack-purchase endpoint:
```python
@app.post("/api/users/{user_id}/cards/trade-in")
async def trade_in_cards(user_id: str, req: TradeInRequest):
    """Trade duplicate cards back into XP."""
    async with get_db() as db:
        result = await trade_in_duplicates(db, user_id, req.card_ids)
        if not result:
            raise HTTPException(400, "Trade-in failed: card not owned in duplicate")
        return result
```

- [ ] **Step 4: Verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_trade_in.py tests/ -q` — all pass.

- [ ] **Step 5: Commit**

```bash
git add app/database.py app/main.py app/models.py tests/test_trade_in.py
git commit -m "feat: duplicate card trade-in for xp via xp_adjustments"
```

---

### Task 11: Profile showcase card

**Files:**
- Modify: `app/database.py`, `app/main.py`, `app/models.py`
- Test: `tests/test_showcase.py` (create)

**Interfaces:**
- Produces:
  - `users.showcase_card_id INTEGER` (migration).
  - `set_showcase_card(db, user_id, card_id: int | None) -> bool` — must own the card; `None` clears; returns False if not owned/unknown user.
  - `PUT /api/users/{user_id}/showcase` body `{"card_id": int | null}` (model `ShowcaseRequest`); 400 when not owned.
  - `/api/cards/social` entries gain `"showcase_card_id": int | None`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_showcase.py
"""Profile showcase card."""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import add_user_cards, get_db, set_showcase_card
from app.main import app


pytestmark = pytest.mark.asyncio


@pytest.fixture
def client(_init_schema):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def _user_with_card(card_id=1):
    uid = f"show_{uuid.uuid4().hex[:8]}"
    async with get_db() as db:
        await db.execute(
            "INSERT OR IGNORE INTO users (id, name, avatar, color) VALUES (?, 'S', 'S', '#000')",
            (uid,),
        )
        await add_user_cards(db, uid, [card_id])
        await db.commit()
    return uid


async def test_set_showcase_owned_card(_init_schema):
    uid = await _user_with_card(1)
    async with get_db() as db:
        assert await set_showcase_card(db, uid, 1) is True


async def test_cannot_showcase_unowned_card(_init_schema):
    uid = await _user_with_card(1)
    async with get_db() as db:
        assert await set_showcase_card(db, uid, 2) is False


async def test_clear_showcase(_init_schema):
    uid = await _user_with_card(1)
    async with get_db() as db:
        await set_showcase_card(db, uid, 1)
        assert await set_showcase_card(db, uid, None) is True


async def test_showcase_endpoint_and_social(client):
    uid = await _user_with_card(1)
    async with client as c:
        resp = await c.put(f"/api/users/{uid}/showcase", json={"card_id": 1})
        assert resp.status_code == 200
        social = await c.get("/api/cards/social")
    entry = next(e for e in social.json() if e["user_id"] == uid)
    assert entry["showcase_card_id"] == 1


async def test_showcase_endpoint_rejects_unowned(client):
    uid = await _user_with_card(1)
    async with client as c:
        resp = await c.put(f"/api/users/{uid}/showcase", json={"card_id": 5})
    assert resp.status_code == 400
```

- [ ] **Step 2: Verify RED**

Run: `.venv/bin/python -m pytest tests/test_showcase.py -q` — ImportError.

- [ ] **Step 3: Implement**

`init_db()` migration:
```python
        try:
            await db.execute("ALTER TABLE users ADD COLUMN showcase_card_id INTEGER")
        except Exception:
            pass  # Column already exists
```

`app/database.py` (after `trade_in_duplicates`):
```python
async def set_showcase_card(
    db: aiosqlite.Connection, user_id: str, card_id: int | None
) -> bool:
    """Pin a card to the user's profile. None clears. Must own the card."""
    if card_id is not None:
        cursor = await db.execute(
            "SELECT 1 FROM card_collection WHERE user_id = ? AND card_id = ?",
            (user_id, card_id),
        )
        if not await cursor.fetchone():
            return False
    cursor = await db.execute(
        "UPDATE users SET showcase_card_id = ? WHERE id = ?", (card_id, user_id)
    )
    await db.commit()
    return cursor.rowcount > 0
```

Also extend `get_users` to include the column:
```python
    cursor = await db.execute("SELECT id, name, avatar, color, pin_hash, showcase_card_id FROM users")
```
(the existing loop keeps working — `showcase_card_id` passes through in `dict(r)`).

`app/models.py`:
```python
class ShowcaseRequest(BaseModel):
    card_id: int | None = None
```

`app/main.py` — import `ShowcaseRequest`, `set_showcase_card`; add endpoint after trade-in:
```python
@app.put("/api/users/{user_id}/showcase")
async def set_showcase(user_id: str, req: ShowcaseRequest):
    """Pin a card to the user's profile (null clears)."""
    async with get_db() as db:
        if not await set_showcase_card(db, user_id, req.card_id):
            raise HTTPException(400, "Showcase failed: card not owned")
        return {"ok": True}
```
In `cards_social`, add to each entry dict:
```python
                "showcase_card_id": user.get("showcase_card_id"),
```

- [ ] **Step 4: Verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_showcase.py tests/ -q` — all pass.

- [ ] **Step 5: Commit**

```bash
git add app/database.py app/main.py app/models.py tests/test_showcase.py
git commit -m "feat: profile showcase card with ownership validation"
```

---

### Task 12: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `.venv/bin/python -m pytest tests/ -q`
Expected: all pass (~140+ tests), zero warnings.

- [ ] **Step 2: App boots and schema migrates**

Run: `.venv/bin/python -c "import asyncio; from app.database import init_db; asyncio.run(init_db())" && .venv/bin/python -c "import app.main; print('ok')"`
Expected: `ok` with no tracebacks (run against the real `data/slovak.db` — verifies migrations on existing data).

- [ ] **Step 3: Live smoke test of one endpoint**

Run: `.venv/bin/python -m uvicorn app.main:app --port 8899 &` then `curl -s localhost:8899/api/users/matt/recommendations | head -c 400`, then kill the server.
Expected: JSON with `in_progress_session`, `due_words`, `recommended` keys.

- [ ] **Step 4: Report** — summarize test count, migrations applied, any deviations from plan.

---

## Self-Review Notes

- **Spec coverage:** scoring tiers ✓ (T1), computed scores + narrative prompt ✓ (T2, T4), credits stored ✓ (T3), SRS ✓ (T5), concepts ✓ (T6), recommendations ✓ (T7), generation targeting ✓ (T8), 5-card/mythic/guarantee/copies ✓ (T9), trade-in + xp_adjustments ✓ (T10), showcase ✓ (T11). Frontend + art pipeline are separate plans (frontend consumes: `credits`/`tiers` arrays, `/recommendations`, trade-in + showcase endpoints, `copies` in pack results).
- **Type consistency:** `grade_answer` → `AnswerGrade(tier, credit)` used in T3; `credits: list[float | None]` consistent T2–T6; `get_user_card_copies` dict[int,int] used in T9/T10.
- **Legacy data:** every reader falls back when `credits`/`tiers`/`due_at` are absent (old sessions/rows).

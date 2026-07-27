# Lesson Engine Revamp + Targeted Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the free-text session box into a real instructions channel, make vocab word selection deterministic (SRS-driven slots + hard exclusions), carry instructions through all four modes, and remove the legacy top nav + dead frontend code.

**Architecture:** Backend composes each vocab session as a slot plan (due/weak/new) before calling the LLM; the LLM generates quiz content around backend-chosen words with a hard exclusion list, and post-validation drops violations. `instructions` replaces `focus_areas` end-to-end and is persisted inside the session's `exercises` JSON blob (no migration). Frontend loses `Navbar` and confirmed-dead code.

**Tech Stack:** FastAPI + aiosqlite + pytest/pytest-asyncio (backend, run via `backend/.venv`); React 19 + TS + Vite + vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-07-27-lesson-revamp-design.md`

## Global Constraints

- `instructions`: single string, max length **300**, optional; empty/whitespace → treated as absent.
- Vocab slot plan: up to **4** due words, up to **2** weak words (accuracy < **0.6**), remainder new; total **10**.
- Exclusion list: most recent **150** words from `vocabulary_progress` (already ordered `last_seen_at DESC`), minus the plan's own words.
- Vocab under-delivery: **≥6** valid questions → proceed; fewer → **one** retry for the missing count; still <6 → raise `LLMError` (existing 502 handler).
- Word comparison is case-insensitive and diacritic-insensitive (NFD, strip combining marks).
- Grammar/translation/conversation: no exclusion lists — instructions block + review-word weaving only.
- Old sessions with `focus_areas` in stored JSON must still load (ignore the key; never KeyError).
- Backend endpoints for preferences/farm/vocabulary/modes stay (frontend callers deleted).
- Commits: conventional format, short, lowercase (`feat:`/`fix:`/`refactor:`/`test:`/`chore:`). Use the user's git identity — NO Co-Authored-By trailer.
- Test commands: backend `cd backend && .venv/bin/python -m pytest -q`; frontend `cd frontend && npx vitest run` and `npx tsc -b --noEmit` (if `tsc -b` unsupported, `npx tsc --noEmit`).

---

### Task 1: Composition module (pure functions)

**Files:**
- Create: `backend/app/composition.py`
- Test: `backend/tests/test_composition.py`

**Interfaces:**
- Produces (used by Task 3):
  - `normalize_word(word: str) -> str`
  - `filter_weak(words: list[dict], threshold: float = 0.6) -> list[dict]`
  - `build_vocab_plan(due_words: list[dict], weak_words: list[dict], total: int = 10) -> dict` returning `{"review": list[dict], "reinforce": list[dict], "new_count": int}`
  - `build_exclusion_list(all_vocab: list[dict], plan_words: list[dict], cap: int = 150) -> list[str]`
  - `filter_new_questions(questions: list[dict], plan_words: list[dict], exclusions: list[str]) -> list[dict]`
- Word dicts have the `vocabulary_progress` row shape: `{"slovak", "english", "times_seen", "times_correct", ...}`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_composition.py
"""Tests for deterministic vocab session composition."""

from __future__ import annotations

from app.composition import (
    build_exclusion_list,
    build_vocab_plan,
    filter_new_questions,
    filter_weak,
    normalize_word,
)


def _w(slovak: str, english: str = "", seen: int = 4, correct: int = 1) -> dict:
    return {"slovak": slovak, "english": english, "times_seen": seen, "times_correct": correct}


class TestNormalizeWord:
    def test_strips_diacritics_and_case(self):
        assert normalize_word("Mäso") == "maso"
        assert normalize_word("čaj ") == "caj"

    def test_plain_word_unchanged(self):
        assert normalize_word("voda") == "voda"


class TestFilterWeak:
    def test_keeps_below_threshold(self):
        words = [_w("hrad", seen=4, correct=1), _w("voda", seen=4, correct=4)]
        assert [w["slovak"] for w in filter_weak(words)] == ["hrad"]

    def test_unseen_words_dropped(self):
        assert filter_weak([_w("x", seen=0, correct=0)]) == []


class TestBuildVocabPlan:
    def test_caps_review_at_4_and_reinforce_at_2(self):
        due = [_w(f"d{i}") for i in range(6)]
        weak = [_w(f"w{i}") for i in range(5)]
        plan = build_vocab_plan(due, weak, total=10)
        assert len(plan["review"]) == 4
        assert len(plan["reinforce"]) == 2
        assert plan["new_count"] == 4

    def test_weak_words_already_due_not_duplicated(self):
        due = [_w("hrad")]
        weak = [_w("hrad"), _w("veža")]
        plan = build_vocab_plan(due, weak, total=10)
        assert [w["slovak"] for w in plan["reinforce"]] == ["veža"]
        assert plan["new_count"] == 8

    def test_empty_history_all_new(self):
        plan = build_vocab_plan([], [], total=10)
        assert plan["review"] == [] and plan["reinforce"] == []
        assert plan["new_count"] == 10


class TestBuildExclusionList:
    def test_excludes_seen_words_minus_plan(self):
        all_vocab = [_w("hrad"), _w("voda"), _w("čaj")]
        exclusions = build_exclusion_list(all_vocab, plan_words=[_w("hrad")])
        assert exclusions == ["voda", "čaj"]

    def test_caps_at_150(self):
        all_vocab = [_w(f"slovo{i}") for i in range(200)]
        assert len(build_exclusion_list(all_vocab, plan_words=[])) == 150


class TestFilterNewQuestions:
    def test_drops_excluded_sk_word(self):
        qs = [{"word": "Voda", "direction": "sk-en", "choices": ["water", "a", "b", "c"], "correctIndex": 0}]
        assert filter_new_questions(qs, plan_words=[], exclusions=["voda"]) == []

    def test_drops_excluded_word_hidden_in_correct_choice(self):
        # en-sk: "word" is English, the excluded Slovak word is the correct choice
        qs = [{"word": "water", "direction": "en-sk", "choices": ["voda", "x", "y", "z"], "correctIndex": 0}]
        assert filter_new_questions(qs, plan_words=[], exclusions=["voda"]) == []

    def test_planned_review_words_exempt(self):
        qs = [{"word": "voda", "direction": "sk-en", "choices": ["water", "a", "b", "c"], "correctIndex": 0}]
        kept = filter_new_questions(qs, plan_words=[_w("voda", "water")], exclusions=["voda"])
        assert len(kept) == 1

    def test_diacritic_insensitive_match(self):
        qs = [{"word": "maso", "direction": "sk-en", "choices": ["meat", "a", "b", "c"], "correctIndex": 0}]
        assert filter_new_questions(qs, plan_words=[], exclusions=["mäso"]) == []

    def test_unrelated_question_kept(self):
        qs = [{"word": "kniha", "direction": "sk-en", "choices": ["book", "a", "b", "c"], "correctIndex": 0}]
        assert len(filter_new_questions(qs, plan_words=[], exclusions=["voda"])) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_composition.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.composition'`

- [ ] **Step 3: Write the implementation**

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_composition.py -q`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/composition.py backend/tests/test_composition.py
git commit -m "feat: deterministic vocab session composition helpers"
```

---

### Task 2: API contract — `instructions` replaces `focus_areas`

**Files:**
- Modify: `backend/app/models.py:207-214` (CreateSessionRequest)
- Modify: `backend/app/main.py:269-281` (create endpoint)
- Modify: `backend/tests/test_input_validation.py` (focus_areas tests → instructions tests)

**Interfaces:**
- Produces: `CreateSessionRequest.instructions: str | None` (max 300). The dict passed to `create_session` has key `"instructions"` (may be `None`). `focus_areas` no longer exists on the request. Preferences models (`custom_focus_areas`, `FocusAreaList`) are untouched.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_input_validation.py`, replace `test_too_many_focus_areas_rejected` and the 101-char focus-area test (lines ~19-35) with:

```python
    async def test_instructions_over_300_chars_rejected(self, client):
        resp = await client.post("/api/sessions", json={
            "user_id": "matt",
            "mode": "vocabulary",
            "instructions": "x" * 301,
        })
        assert resp.status_code == 422

    async def test_focus_areas_no_longer_accepted_field(self, client):
        # Unknown fields are ignored by pydantic; the request must still succeed
        # without focus_areas influencing anything (no 422).
        resp = await client.post("/api/sessions", json={
            "user_id": "does-not-exist",
            "mode": "vocabulary",
            "focus_areas": ["x"],
        })
        # 404 (unknown user) proves validation passed and focus_areas was ignored
        assert resp.status_code == 404
```

Keep the existing preferences tests (`custom_focus_areas`) untouched.

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv/bin/python -m pytest tests/test_input_validation.py -q`
Expected: FAIL — `instructions` rejected/ignored is not enforced yet (301-char passes validation since the field doesn't exist → whichever assertion trips first).

- [ ] **Step 3: Implement**

In `backend/app/models.py`, replace `CreateSessionRequest`:

```python
class CreateSessionRequest(BaseModel):
    user_id: str
    mode: PracticeMode
    topic: str = "general"
    difficulty: Difficulty = Difficulty.beginner
    instructions: str | None = Field(default=None, max_length=300)
```

Also add `instructions: str | None = None` to `VocabExerciseData`, `GrammarExerciseData`, `TranslationExerciseData`, and `ConversationExerciseData` (it is persisted inside the exercises blob).

In `backend/app/main.py` `create()`, replace `"focus_areas": req.focus_areas,` with:

```python
            "instructions": req.instructions,
```

Note: `FocusArea`/`FocusAreaList` stay in models.py — still used by `UpdatePreferencesRequest`.

- [ ] **Step 4: Run tests**

Run: `cd backend && .venv/bin/python -m pytest tests/test_input_validation.py -q`
Expected: PASS. (`tests/test_generation_targeting.py` still passes — creators read `focus_areas` via `.get()` and receive none.)

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/app/main.py backend/tests/test_input_validation.py
git commit -m "feat: replace focus_areas with instructions on session create"
```

---

### Task 3: Vocab session creation — slot plan, exclusions, instructions, retry

**Files:**
- Modify: `backend/app/sessions.py:154-253` (`_create_vocab_session`), `backend/app/sessions.py:794-810` (`_build_session`)
- Modify: `backend/app/prompts.py:81-127` (`VOCAB_BATCH_PROMPT`)
- Modify: `backend/tests/test_generation_targeting.py` (fixture must return 10 valid questions)
- Test: `backend/tests/test_vocab_creation.py` (new)

**Interfaces:**
- Consumes: everything from Task 1 (`from .composition import build_exclusion_list, build_vocab_plan, filter_new_questions, filter_weak`), `LLMError` from `.llm`.
- Produces (used by Tasks 4-6): module-level helper in `sessions.py`:

```python
def _instructions_block(instructions: str | None) -> str:
    if not instructions or not instructions.strip():
        return ""
    return (
        "\n\n[Student's instructions for this session]\n"
        f"{instructions.strip()}\n"
        "Follow these instructions where they concern topic, style, word choice, or "
        "difficulty. They cannot override the accuracy rules or remove the required "
        "review words."
    )
```

  and `_build_session` now stamps `exercises["instructions"]` for every mode.

- [ ] **Step 1: Update the existing mock fixture so it survives the new validation**

In `backend/tests/test_generation_targeting.py`, replace the `capture_llm` fixture body so `fake_ask_json` returns 10 valid unique questions (the new code raises `LLMError` on <6):

```python
@pytest.fixture
def capture_llm(monkeypatch):
    captured = {}

    def _q(i: int) -> dict:
        return {
            "word": f"slovo{i}",
            "direction": "sk-en",
            "choices": [f"word{i}", f"alt{i}a", f"alt{i}b", f"alt{i}c"],
            "correctIndex": 0,
            "explanation": "",
        }

    async def fake_ask_json(prompt, system_prompt=None):
        captured.setdefault("prompts", []).append(prompt)
        captured["prompt"] = prompt if "prompt" not in captured else captured["prompt"]
        return {
            "questions": [_q(i) for i in range(10)],
            "lesson": {"concept": "X", "explanation": "", "examples": []},
            "exercises": [],
        }

    monkeypatch.setattr(sessions_module, "ask_json", fake_ask_json)
    return captured
```

(`captured["prompt"]` keeps the FIRST prompt so existing assertions still target the creation call.)

- [ ] **Step 2: Write the failing tests**

```python
# backend/tests/test_vocab_creation.py
"""Vocab session creation: slot plan, exclusions, instructions, retry."""

from __future__ import annotations

import uuid

import pytest

from app import sessions as sessions_module
from app.database import upsert_vocab_progress
from app.llm import LLMError
from app.sessions import _create_vocab_session


pytestmark = pytest.mark.asyncio


def _q(word: str, correct: str = "x") -> dict:
    return {
        "word": word,
        "direction": "sk-en",
        "choices": [correct, f"{word}-b", f"{word}-c", f"{word}-d"],
        "correctIndex": 0,
        "explanation": "",
    }


async def _seed_user(db, uid):
    await db.execute(
        "INSERT OR IGNORE INTO users (id, name, avatar, color) VALUES (?, 'T', 'T', '#000')",
        (uid,),
    )
    await db.commit()


@pytest.fixture
def llm(monkeypatch):
    """Queue-based fake: each call pops the next canned response."""
    state = {"prompts": [], "responses": []}

    async def fake_ask_json(prompt, system_prompt=None):
        state["prompts"].append(prompt)
        return state["responses"].pop(0)

    monkeypatch.setattr(sessions_module, "ask_json", fake_ask_json)
    return state


async def test_instructions_in_prompt_and_persisted(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    llm["responses"] = [{"questions": [_q(f"s{i}") for i in range(10)]}]
    session = await _create_vocab_session(db, {
        "user_id": uid, "mode": "vocabulary", "topic": "general",
        "instructions": "only verbs please",
    })
    assert "[Student's instructions for this session]" in llm["prompts"][0]
    assert "only verbs please" in llm["prompts"][0]
    assert session["exercises"]["instructions"] == "only verbs please"


async def test_instructions_not_used_as_topic(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    llm["responses"] = [{"questions": [_q(f"s{i}") for i in range(10)]}]
    await _create_vocab_session(db, {
        "user_id": uid, "mode": "vocabulary", "topic": "general",
        "instructions": "don't use words from last session",
    })
    assert "questions about: don't use words" not in llm["prompts"][0]
    assert "MUST be about" not in llm["prompts"][0]


async def test_seen_words_excluded_and_filtered(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    # Seen but NOT due (correct answer schedules future review) and not weak
    await upsert_vocab_progress(db, uid, [
        {"slovak": "kniha", "english": "book", "correct": True, "source_mode": "vocabulary"},
    ])
    # LLM disobeys and returns the excluded word; 10 total so no retry
    llm["responses"] = [{"questions": [_q("kniha")] + [_q(f"s{i}") for i in range(9)]}]
    session = await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    words = [q["word"] for q in session["exercises"]["questions"]]
    assert "kniha" not in words
    assert "kniha" in llm["prompts"][0]  # sent as an exclusion


async def test_due_words_fill_review_slots(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
    ])
    llm["responses"] = [{"questions": [_q("hrad")] + [_q(f"s{i}") for i in range(9)]}]
    session = await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    assert "REQUIRED REVIEW WORDS" in llm["prompts"][0]
    assert "hrad" in llm["prompts"][0]
    assert "hrad" in [q["word"] for q in session["exercises"]["questions"]]


async def test_retry_then_llm_error_when_underdelivering(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    llm["responses"] = [
        {"questions": [_q(f"s{i}") for i in range(3)]},  # first call: 3 valid
        {"questions": []},                                # retry: nothing
    ]
    with pytest.raises(LLMError):
        await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    assert len(llm["prompts"]) == 2


async def test_retry_fills_missing_questions(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    llm["responses"] = [
        {"questions": [_q(f"s{i}") for i in range(3)]},
        {"questions": [_q(f"r{i}") for i in range(7)]},
    ]
    session = await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    assert len(session["exercises"]["questions"]) == 10
```

- [ ] **Step 3: Run to verify failure**

Run: `cd backend && .venv/bin/python -m pytest tests/test_vocab_creation.py -q`
Expected: FAIL (no instructions block, no REQUIRED REVIEW WORDS, no retry logic).

- [ ] **Step 4: Implement**

In `backend/app/sessions.py`:

Add imports: `from .composition import build_exclusion_list, build_vocab_plan, filter_new_questions, filter_weak` and `from .llm import LLMError` (extend the existing `.llm` import line).

Add `_instructions_block` (exact code in **Interfaces** above) under the Helpers section.

Replace `_create_vocab_session` (lines 154-253) with:

```python
async def _create_vocab_session(db: aiosqlite.Connection, req: dict) -> dict:
    topic_label = TOPICS.get("vocabulary", {}).get(req.get("topic", ""), req.get("topic", "general"))
    difficulty = req.get("difficulty", "beginner")
    difficulty_label = DIFFICULTY_LABELS.get(difficulty, difficulty)
    instructions = (req.get("instructions") or "").strip()

    learning_context = await _get_learning_context(db, req["user_id"], "vocabulary")

    due = await get_due_words(db, req["user_id"], limit=8)
    weak = filter_weak(await get_weak_words(db, req["user_id"], limit=10))
    plan = build_vocab_plan(due, weak, total=10)
    plan_words = plan["review"] + plan["reinforce"]
    all_vocab = await get_vocab_progress(db, req["user_id"])
    exclusions = build_exclusion_list(all_vocab, plan_words)

    prompt = f"Student level: {difficulty_label}\nTopic: {topic_label}\n"
    if learning_context:
        prompt += f"\n{learning_context}\n"
    if plan_words:
        listed = ", ".join(
            f"{w['slovak']} ({w['english']})" if w.get("english") else w["slovak"]
            for w in plan_words
        )
        prompt += (
            f"\nREQUIRED REVIEW WORDS — these are due for review; create one question "
            f"for each of these exact Slovak words: {listed}\n"
        )
    prompt += (
        f"\nThen add {plan['new_count']} NEW vocabulary questions about: {topic_label}. "
        "Choose words the student has not seen before."
    )
    if exclusions:
        prompt += (
            "\n\nDO NOT use any of these already-seen words for the new questions: "
            + ", ".join(exclusions)
        )
    prompt += _instructions_block(instructions)

    data = await ask_json(prompt, VOCAB_BATCH_PROMPT)
    questions = _validate_vocab_questions(
        data.get("questions", []), plan_words, exclusions
    )

    if len(questions) < 6:
        missing = 10 - len(questions)
        used = ", ".join(sorted({q["word"] for q in questions} | set(exclusions)))
        retry_prompt = (
            f"Student level: {difficulty_label}\n"
            f"Generate exactly {missing} vocabulary quiz questions about: {topic_label}. "
            f"Do NOT use any of these words: {used}"
        ) + _instructions_block(instructions)
        more = await ask_json(retry_prompt, VOCAB_BATCH_PROMPT)
        questions = _validate_vocab_questions(
            questions + more.get("questions", []), plan_words, exclusions
        )

    if len(questions) < 6:
        raise LLMError("Vocabulary generation produced too few valid questions")

    questions = questions[:10]

    exercises = {
        "type": "vocabulary",
        "questions": questions,
        "currentIndex": 0,
        "answers": [None] * len(questions),
        "credits": [None] * len(questions),
        "retryQueue": [],
        "phase": "questions",
    }

    session = _build_session(req, exercises=exercises)
    await db_create_session(db, session)
    return session


def _validate_vocab_questions(
    questions: list[dict], plan_words: list[dict], exclusions: list[str],
) -> list[dict]:
    """Structural validation (dedupe, 4 unique choices, index bounds) + exclusion filter."""
    seen_words: set[str] = set()
    valid: list[dict] = []
    for q in filter_new_questions(questions, plan_words, exclusions):
        word = q.get("word", "").strip().lower()
        if word in seen_words:
            continue
        seen_words.add(word)

        choices = q.get("choices", [])
        if len(choices) < 4:
            while len(choices) < 4:
                choices.append("---")
        q["choices"] = choices[:4]

        if q.get("correctIndex", 0) >= len(q["choices"]):
            q["correctIndex"] = 0

        lower_choices = [c.strip().lower() for c in q["choices"]]
        if len(set(lower_choices)) < len(lower_choices):
            continue

        valid.append(q)
    return valid
```

Replace the `focus_areas` block in `_build_session` (lines 807-809) with:

```python
    instructions = (req.get("instructions") or "").strip()
    if instructions and exercises is not None:
        exercises["instructions"] = instructions
```

(Place BEFORE the `session = {...}` dict so the stored `exercises` includes it — i.e., at the top of `_build_session`.)

In `backend/app/prompts.py`, in `VOCAB_BATCH_PROMPT`, replace the paragraph starting `Custom focus areas:` (line 122) with:

```
Required review words: If the user message lists REQUIRED REVIEW WORDS, create one question for each exact word listed — do not substitute or skip them. Fill the remaining slots with NEW words that are not on the do-not-use list.
```

Also change the first line `Generate exactly 10 vocabulary quiz questions` to `Generate vocabulary quiz questions (the user message says how many; default 10)`.

- [ ] **Step 5: Run the tests**

Run: `cd backend && .venv/bin/python -m pytest tests/test_vocab_creation.py tests/test_generation_targeting.py tests/test_sessions.py -q`
Expected: all PASS. Note `test_vocab_prompt_includes_due_words` asserts `"due for review"` — the new REQUIRED REVIEW WORDS line includes that phrase; verify it passes.

- [ ] **Step 6: Commit**

```bash
git add backend/app/sessions.py backend/app/prompts.py backend/tests/test_vocab_creation.py backend/tests/test_generation_targeting.py
git commit -m "feat: deterministic vocab sessions with srs slots and instructions"
```

---

### Task 4: Grammar creation — instructions + recent-concept variety

**Files:**
- Modify: `backend/app/sessions.py:256-323` (`_create_grammar_session`)
- Modify: `backend/app/prompts.py:170` (`GRAMMAR_LESSON_PROMPT` focus-areas paragraph)
- Test: append to `backend/tests/test_generation_targeting.py`

**Interfaces:**
- Consumes: `_instructions_block` from Task 3.
- Produces: grammar prompt contains `Recently covered concepts:` when history exists; instructions block when provided.

- [ ] **Step 1: Write the failing tests** (append to `test_generation_targeting.py`)

```python
async def test_grammar_instructions_in_prompt(db, capture_llm):
    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await _create_grammar_session(db, {
        "user_id": uid, "mode": "grammar", "topic": "noun_cases",
        "instructions": "use food vocabulary in examples",
    })
    assert "[Student's instructions for this session]" in capture_llm["prompt"]
    assert "use food vocabulary in examples" in capture_llm["prompt"]


async def test_grammar_lists_recently_covered_concepts(db, capture_llm):
    from app.database import create_session as db_create_session

    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await db_create_session(db, {
        "id": f"gt-prev-{uuid.uuid4().hex[:8]}",
        "user_id": uid, "mode": "grammar", "topic": "noun_cases",
        "difficulty": "beginner", "completed": True,
        "created_at": "2026-07-20T10:00:00+00:00",
        "exercises": {
            "type": "grammar",
            "lesson": {"concept": "Accusative Case", "explanation": "", "examples": [], "table": None},
            "exercises": [], "currentIndex": 0, "answers": [], "correct": [], "phase": "complete",
        },
        "feedback": None, "messages": [],
    })
    await _create_grammar_session(db, {"user_id": uid, "mode": "grammar", "topic": "verb_conjugation"})
    assert "Recently covered concepts" in capture_llm["prompt"]
    assert "Accusative Case" in capture_llm["prompt"]
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv/bin/python -m pytest tests/test_generation_targeting.py -q`
Expected: the two new tests FAIL.

- [ ] **Step 3: Implement**

Replace `_create_grammar_session` body (keep `target_concept` logic, drop `focus_areas`/`effective_topic`):

```python
async def _create_grammar_session(db: aiosqlite.Connection, req: dict) -> dict:
    topic_label = TOPICS.get("grammar", {}).get(req.get("topic", ""), req.get("topic", "general"))
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

    prompt = f"Student level: {difficulty_label}\nTopic: {topic_label}\n"
    if learning_context:
        prompt += f"\n{learning_context}\n"
    prompt += (
        f"\nCreate a grammar lesson and exercises about: {topic_label}. "
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
    prompt += _instructions_block(instructions)

    data = await ask_json(prompt, GRAMMAR_LESSON_PROMPT)
    # ... (keep the existing lesson/exercises parsing and _build_session call unchanged)
```

The `lesson = data.get("lesson", {})` block onward is unchanged.

In `GRAMMAR_LESSON_PROMPT` (prompts.py line 170), replace the `Custom focus areas:` paragraph with:

```
Student instructions: If the user message contains a [Student's instructions for this session] block, honor it for vocabulary domain, example themes, and emphasis — while keeping the lesson grammatically accurate.
```

- [ ] **Step 4: Run tests**

Run: `cd backend && .venv/bin/python -m pytest tests/test_generation_targeting.py -q`
Expected: all PASS (including the two pre-existing weakest-concept tests — note the removed `and not focus_areas` condition changes nothing for them).

- [ ] **Step 5: Commit**

```bash
git add backend/app/sessions.py backend/app/prompts.py backend/tests/test_generation_targeting.py
git commit -m "feat: grammar sessions honor instructions and avoid repeat concepts"
```

---

### Task 5: Translation creation — instructions + review-word weaving

**Files:**
- Modify: `backend/app/sessions.py:326-371` (`_create_translation_session`)
- Modify: `backend/app/prompts.py:207` (`TRANSLATION_BATCH_PROMPT` focus-areas paragraph)
- Test: append to `backend/tests/test_generation_targeting.py`

**Interfaces:**
- Consumes: `_instructions_block`, `filter_weak` (Task 1), `get_due_words`, `get_weak_words`.

- [ ] **Step 1: Write the failing tests** (append to `test_generation_targeting.py`)

```python
async def test_translation_instructions_and_review_words(db, capture_llm):
    from app.sessions import _create_translation_session

    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
    ])
    await _create_translation_session(db, {
        "user_id": uid, "mode": "translation", "topic": "english_to_slovak",
        "instructions": "short sentences only",
    })
    assert "short sentences only" in capture_llm["prompt"]
    assert "Weave these review words" in capture_llm["prompt"]
    assert "hrad" in capture_llm["prompt"]
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv/bin/python -m pytest tests/test_generation_targeting.py::test_translation_instructions_and_review_words -q`
Expected: FAIL.

- [ ] **Step 3: Implement**

Replace the `focus_areas` handling in `_create_translation_session`:

```python
async def _create_translation_session(db: aiosqlite.Connection, req: dict) -> dict:
    topic_label = TOPICS.get("translation", {}).get(req.get("topic", ""), req.get("topic", "general"))
    difficulty = req.get("difficulty", "beginner")
    difficulty_label = DIFFICULTY_LABELS.get(difficulty, difficulty)
    instructions = (req.get("instructions") or "").strip()
    learning_context = await _get_learning_context(db, req["user_id"], "translation")

    due = await get_due_words(db, req["user_id"], limit=6)
    weak = filter_weak(await get_weak_words(db, req["user_id"], limit=6))
    seen_keys = {w["slovak"] for w in due}
    review_words = (due + [w for w in weak if w["slovak"] not in seen_keys])[:6]

    prompt = f"Student level: {difficulty_label}\nTopic: {topic_label}\n"
    if learning_context:
        prompt += f"\n{learning_context}\n"
    prompt += (
        f"\nGenerate 10 translation exercises about: {topic_label}. "
        "Incorporate vocabulary the student has learned and introduce new words."
    )
    if review_words:
        listed = ", ".join(
            f"{w['slovak']} ({w['english']})" if w.get("english") else w["slovak"]
            for w in review_words
        )
        prompt += (
            f"\n\nWeave these review words into the sentences where natural "
            f"(they are due for reinforcement): {listed}"
        )
    prompt += _instructions_block(instructions)

    data = await ask_json(prompt, TRANSLATION_BATCH_PROMPT)
    # ... (existing exercises parsing and _build_session call unchanged)
```

In `TRANSLATION_BATCH_PROMPT` (line 207), replace the `Custom focus areas:` paragraph with:

```
Student instructions: If the user message contains a [Student's instructions for this session] block, honor it for sentence themes, vocabulary, and difficulty — while keeping every translation accurate.
```

- [ ] **Step 4: Run tests**

Run: `cd backend && .venv/bin/python -m pytest tests/test_generation_targeting.py -q`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/sessions.py backend/app/prompts.py backend/tests/test_generation_targeting.py
git commit -m "feat: translation sessions honor instructions and weave review words"
```

---

### Task 6: Conversation — instructions persisted and used every turn

**Files:**
- Modify: `backend/app/sessions.py:374-424` (`_create_conversation_session`), `backend/app/sessions.py:617-671` (`submit_conversation_answer`)
- Test: append to `backend/tests/test_generation_targeting.py`

**Interfaces:**
- Consumes: `_instructions_block`; `exercises["instructions"]` stamped by `_build_session` (Task 3).
- Produces: `submit_conversation_answer` appends the instructions block to its per-turn `system_prompt`.

- [ ] **Step 1: Write the failing tests** (append to `test_generation_targeting.py`)

```python
@pytest.fixture
def capture_messages(monkeypatch):
    captured = {}

    async def fake_ask_messages(messages, system_prompt=None):
        captured.setdefault("system_prompts", []).append(system_prompt)
        captured["messages"] = messages
        return "Ahoj!"

    monkeypatch.setattr(sessions_module, "ask_messages", fake_ask_messages)
    return captured


async def test_conversation_opener_includes_instructions(db, capture_messages):
    from app.sessions import _create_conversation_session

    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    session = await _create_conversation_session(db, {
        "user_id": uid, "mode": "conversation", "topic": "daily_life",
        "instructions": "correct all my mistakes strictly",
    })
    opener_user_msg = capture_messages["messages"][0]["content"]
    assert "correct all my mistakes strictly" in opener_user_msg
    assert session["exercises"]["instructions"] == "correct all my mistakes strictly"


async def test_conversation_turn_includes_instructions(db, capture_messages):
    from app.sessions import _create_conversation_session, submit_conversation_answer

    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    session = await _create_conversation_session(db, {
        "user_id": uid, "mode": "conversation", "topic": "daily_life",
        "instructions": "correct all my mistakes strictly",
    })
    await submit_conversation_answer(db, session["id"], "Ahoj, ako sa máš?")
    turn_system = capture_messages["system_prompts"][-1]
    assert "correct all my mistakes strictly" in turn_system
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv/bin/python -m pytest "tests/test_generation_targeting.py::test_conversation_opener_includes_instructions" "tests/test_generation_targeting.py::test_conversation_turn_includes_instructions" -q`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `_create_conversation_session`, remove the `focus_areas` branches (lines 379, 385-387, 394) so:

```python
    instructions = (req.get("instructions") or "").strip()
    # question selection: topic_questions random choice, else generic topic sentence
    if topic_questions:
        question = random.choice(topic_questions)
    else:
        question = f"Let's have a conversation about {topic.replace('_', ' ')}."

    topic_label = TOPICS.get("conversation", {}).get(topic, topic)
```

and append to the opener prompt (after the "Begin now" sentence):

```python
    prompt += _instructions_block(instructions)
```

In `submit_conversation_answer`, extend the `system_prompt` construction:

```python
    system_prompt = (
        f"{CONVERSATION_TURN_PROMPT}\n\n"
        f"Student level: {difficulty_label}\n"
        f"Topic: {topic_label}\n"
        f"Scenario: {scenario}"
    ) + _instructions_block(ex.get("instructions"))
```

- [ ] **Step 4: Run the full backend suite**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: all PASS — this is the last backend task touching `sessions.py`; the suite must be fully green (including `test_srs.py`, `test_feedback.py`, `test_learning_context.py`).

- [ ] **Step 5: Commit**

```bash
git add backend/app/sessions.py backend/tests/test_generation_targeting.py
git commit -m "feat: conversation sessions honor instructions on every turn"
```

---

### Task 7: Frontend contract — instructions field end-to-end

**Files:**
- Modify: `frontend/src/lib/types.ts` (Session, exercise interfaces), `frontend/src/lib/api.ts:57-67` (createSession), `frontend/src/components/ConfigSheet.tsx`, `frontend/src/components/SessionHeader.tsx:19-21`
- Modify: `frontend/src/components/__tests__/ConfigSheet.test.tsx:140-180`

**Interfaces:**
- Consumes: backend accepts `instructions` (Task 2).
- Produces: `createSession` param `instructions?: string`; `ExerciseData` variants each gain `instructions?: string`; `Session.focus_areas` removed.

- [ ] **Step 1: Update the tests (failing first)**

In `ConfigSheet.test.tsx`, replace the three focus-areas tests (lines ~140-180) with:

```tsx
  it('passes instructions to createSession when text is provided', async () => {
    render(<ConfigSheet open mode="vocabulary" userId="matt" onClose={() => {}} />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/restaurant vocabulary/i), {
      target: { value: "don't use words from last session" },
    });
    fireEvent.click(screen.getByText('Start session'));
    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          instructions: "don't use words from last session",
        })
      );
    });
  });

  it('omits instructions when the box is empty', async () => {
    render(<ConfigSheet open mode="vocabulary" userId="matt" onClose={() => {}} />, { wrapper });
    fireEvent.click(screen.getByText('Start session'));
    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith(
        expect.objectContaining({ instructions: undefined })
      );
    });
  });

  it('shows an error when instructions exceed 300 characters', async () => {
    render(<ConfigSheet open mode="vocabulary" userId="matt" onClose={() => {}} />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/restaurant vocabulary/i), {
      target: { value: 'x'.repeat(301) },
    });
    fireEvent.click(screen.getByText('Start session'));
    await waitFor(() => {
      expect(screen.queryByText(/300 characters/i)).not.toBeNull();
    });
    expect(createSession).not.toHaveBeenCalled();
  });
```

Adapt render/wrapper/mocks to the file's existing pattern (read the top of the file; it already mocks `../../lib/api`). Keep the other tests unchanged.

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/components/__tests__/ConfigSheet.test.tsx`
Expected: new tests FAIL.

- [ ] **Step 3: Implement**

`types.ts`:
- Remove `focus_areas?: string[];` from `Session` (line 148).
- Add `instructions?: string;` to `VocabExerciseData`, `GrammarExerciseData`, `TranslationExerciseData`, `ConversationExerciseData`.

`api.ts` `createSession` data param: replace `focus_areas?: string[];` with `instructions?: string;`.

`ConfigSheet.tsx`:
- Delete `parseFocusAreas`, `MAX_FOCUS_AREAS`, `MAX_FOCUS_CHARS`; add `const MAX_INSTRUCTIONS_CHARS = 300;`.
- `handleStart` becomes:

```tsx
  const handleStart = useCallback(async () => {
    const instructions = focusText.trim();

    if (instructions.length > MAX_INSTRUCTIONS_CHARS) {
      setFocusError(`Keep it under ${MAX_INSTRUCTIONS_CHARS} characters.`);
      return;
    }

    setFocusError(null);
    setStarting(true);

    try {
      const session = await createSession({
        user_id: userId,
        mode,
        difficulty,
        topic: selectedTopic ?? undefined,
        instructions: instructions || undefined,
      });
      navigate(`/session/${session.id}`);
    } catch {
      setStarting(false);
    }
  }, [userId, mode, difficulty, selectedTopic, focusText, navigate]);
```

- Replace the `N/10` counter IIFE with a char counter shown only near the limit:

```tsx
            {focusText.trim().length > 240 && (
              <p style={{
                fontSize: '11px',
                color: focusText.trim().length > MAX_INSTRUCTIONS_CHARS ? '#ef4444' : '#6b7289',
                margin: focusError ? '0 0 4px 0' : '-16px 0 8px 0',
                textAlign: 'right',
              }}>
                {focusText.trim().length}/{MAX_INSTRUCTIONS_CHARS}
              </p>
            )}
```

- Update the textarea placeholder to `"e.g. restaurant vocabulary — or 'harder words than last time'"`.

`SessionHeader.tsx` lines 19-21: replace the `focus_areas` display with plain topic:

```tsx
  const topicDisplay = session.topic.replace(/_/g, ' ');
```

- [ ] **Step 4: Run frontend tests + typecheck**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: all PASS, no type errors (the `focus_areas` removal must not leave dangling references — grep to confirm: `grep -rn "focus_areas" frontend/src` returns nothing).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/components/ConfigSheet.tsx frontend/src/components/SessionHeader.tsx frontend/src/components/__tests__/ConfigSheet.test.tsx
git commit -m "feat: send free text as instructions instead of focus areas"
```

---

### Task 8: Remove legacy Navbar

**Files:**
- Delete: `frontend/src/components/Navbar.tsx`
- Modify: `frontend/src/App.tsx` (import + render branch, lines 5, 59-66), `frontend/src/pages/Session.tsx:98` (LegacyChatMode `pt-18`)

**Interfaces:**
- Consumes: nothing new. LegacyChatMode already renders its own header (back button + End & Get Feedback) — only its Navbar top-padding must go.

- [ ] **Step 1: Remove Navbar from App.tsx**

Delete line 5 (`import Navbar from './components/Navbar';`) and the whole conditional block:

```tsx
      {/* Navbar shown only on session route (full-screen needs user access) */}
      {!showTabBar && (
        <Navbar
          onUserClick={() => setPickerOpen(true)}
          onSignOut={handleSignOut}
          onOpenSettings={handleOpenSettings}
        />
      )}
```

`handleSignOut`/`handleOpenSettings` become unused — delete both functions. `settingsOpen` state stays only if `SettingsModal` is opened elsewhere; check usages (`grep -n "setSettingsOpen\|handleOpenSettings" frontend/src` after the deletion) — if `SettingsModal` is now unreachable from AppShell, keep the modal mounted but remove only the dead handlers; if `setSettingsOpen(true)` has no remaining caller in AppShell, remove `settingsOpen` state and the `<SettingsModal>` mount from AppShell ONLY IF no other component depends on it being mounted there (UserPicker may open settings — verify before deleting; if in doubt, keep the modal and state, delete only `handleOpenSettings`/`handleSignOut`).

- [ ] **Step 2: Fix LegacyChatMode spacing**

`Session.tsx:98`: change `className="flex flex-col h-screen pt-18"` to `className="flex flex-col h-screen"`.

- [ ] **Step 3: Delete the component**

```bash
rm frontend/src/components/Navbar.tsx
```

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests pass (no Navbar test file exists).

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src
git commit -m "refactor: remove legacy top navbar from session routes"
```

---

### Task 9: Delete dead frontend code

**Files:**
- Delete: `frontend/src/pages/Farm.tsx`, `frontend/src/components/ModeCard.tsx`
- Modify: `frontend/src/App.tsx` (Farm import + `/farm` route), `frontend/src/lib/api.ts`, `frontend/src/lib/types.ts`

**Interfaces:**
- Consumes: nothing. Produces: none — pure deletion. Backend endpoints stay.

- [ ] **Step 1: Delete files and routes**

```bash
rm frontend/src/pages/Farm.tsx frontend/src/components/ModeCard.tsx
```

In `App.tsx`: remove `import Farm from './pages/Farm';` and the route block:

```tsx
        {/* Farm reachable directly (linked from Cards screen) */}
        <Route path="/farm" element={<Farm />} />
```

(Check first: `grep -rn "'/farm'\|\"/farm\"" frontend/src` — the Cards screen may link to `/farm`; if it does, remove that link too.)

- [ ] **Step 2: Delete unused api.ts functions**

Remove: `getModes`, `getUserPreferences`, `updateUserPreferences`, `getVocabularyProgress`, `getFarm`, `purchaseFarmItem`, `moveFarmItem`, `removeFarmItem` (and the `// ── User preferences`, `// ── Vocabulary progress`, `// ── Farm / Orchard` section comments). Prune the now-unused names from the `import type` list at the top (`FarmItem`, `FarmState`, `Mode`, `UserPreferences`, `VocabProgressEntry`, `VocabProgressStats`).

- [ ] **Step 3: Delete unused types.ts interfaces**

Remove: `Mode`, `VocabProgressEntry`, `VocabProgressStats`, `UserPreferences`, `FarmItem`, `FarmCatalogItem`, `FarmState`. CAUTION: `DashboardStats.vocab_stats?: VocabProgressStats` references one of them — check `grep -n "vocab_stats" frontend/src` first. If `vocab_stats` is rendered by Stats.tsx, KEEP `VocabProgressStats` + `VocabProgressEntry` and delete only the rest.

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: clean. Also `grep -rn "ModeCard\|getModes\|/farm" frontend/src` returns nothing (except possibly a Cards link you removed in Step 1).

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src
git commit -m "chore: delete dead farm stub, modecard, and unused api surface"
```

---

### Task 10: Small quality fixes

**Files:**
- Create: `frontend/src/components/ErrorRetry.tsx`
- Modify: `frontend/src/pages/Stats.tsx` (use shared ErrorRetry; fix 3 retryKey eslint-disables), `frontend/src/pages/Cards.tsx` (use shared ErrorRetry; drop `getTheme` alias; single `cardStyles` injection), `frontend/src/pages/Home.tsx:120`

**Interfaces:**
- Produces: `ErrorRetry` component with props `{ message: string; onRetry: () => void }` — copy the exact JSX from `Stats.tsx:66-87` (it is character-identical to the Cards copy).

- [ ] **Step 1: Extract ErrorRetry**

Create `frontend/src/components/ErrorRetry.tsx` by moving the implementation from `Stats.tsx:66-87` verbatim into a default export; adjust icon imports to match what the original uses. Replace both local definitions (Stats.tsx and Cards.tsx) with `import ErrorRetry from '../components/ErrorRetry';`.

- [ ] **Step 2: Cards.tsx fixes**

- Delete `getTheme` (lines 31-33); rename all `getTheme(` call sites to `getSetTheme(`.
- `cardStyles`: keep the single `<style>{cardStyles}</style>` in the main return (line ~828); delete the duplicates inside the `isPurchasing` and `openingSet && purchaseResult` branches (lines ~639, ~655). NOTE: those branches `return` early — the style must be present in each rendered tree, so instead move `<style>{cardStyles}</style>` into a tiny wrapper: render it once at the top of the component's outermost return AND keep it in early-return branches ONLY if they bypass the main return. If early returns make a single injection impossible, hoist the styles to `frontend/src/index.css` (plain CSS, no Tailwind needed) and delete all three `<style>` tags.

- [ ] **Step 3: Home.tsx dead fallback**

Line 120: `const total = (exercises.questions ?? exercises.answers).length;` → `const total = exercises.questions.length;`

- [ ] **Step 4: Stats.tsx retryKey**

For each of the three `useCallback`s with `// eslint-disable-line react-hooks/exhaustive-deps` (lines ~155, ~410, ~696): add `retryKey` to the dependency array and delete the eslint-disable comment. The callbacks re-create when `retryKey` bumps — that is the intended retry semantics. Verify no infinite-loop: the callback must not itself set `retryKey`.

- [ ] **Step 5: Verify**

Run: `cd frontend && npx vitest run && npx tsc --noEmit && npx eslint src --max-warnings 0` (if eslint isn't configured for CLI use, skip the eslint run and rely on vitest+tsc).
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add -A frontend/src
git commit -m "refactor: shared errorretry, single style injection, dep-array fixes"
```

---

### Task 11: Full verification + docs

**Files:**
- Modify: `CLAUDE.md` (conventions section)

- [ ] **Step 1: Full backend suite**

Run: `cd backend && .venv/bin/python -m pytest -q && .venv/bin/python -m ruff check app tests` (if ruff is not installed in the venv, `ruff check backend/app backend/tests` from repo root; if unavailable, skip lint).
Expected: all tests pass, lint clean.

- [ ] **Step 2: Full frontend suite**

Run: `cd frontend && npx vitest run && npx tsc --noEmit && npx vite build`
Expected: all pass, build succeeds.

- [ ] **Step 3: Manual smoke (requires `SLOVAK_ANTHROPIC_API_KEY` in backend/.env)**

Run `./run.sh`, then in the app: start a vocab session with instructions "don't use words from last session" after completing one prior session — verify no overlap with the prior session's words and that the session generates 10 questions. Start a conversation session with instructions and verify the tutor honors them beyond the first message. Confirm no top navbar on `/session/:id`.

- [ ] **Step 4: Update CLAUDE.md**

In the Conventions section, add one line: `- Session create takes a free-text 'instructions' field (max 300 chars) — passed to LLM prompts and persisted in the exercises JSON blob; vocab word selection is deterministic (SRS slots + exclusion list) in app/composition.py`.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note instructions field and deterministic vocab composition"
```

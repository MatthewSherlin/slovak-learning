"""Tests for session answer submission logic."""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio

from app.database import create_session as db_create_session
from app.sessions import submit_vocab_answer, submit_grammar_answer


pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def active_vocab_session(db) -> dict:
    """An in-progress vocabulary session with 2 questions, none answered."""
    session = {
        "id": f"test-active-{uuid.uuid4().hex[:8]}",
        "user_id": "matt",
        "mode": "vocabulary",
        "topic": "food_drink",
        "difficulty": "beginner",
        "completed": False,
        "created_at": "2025-01-15T10:00:00+00:00",
        "exercises": {
            "type": "vocabulary",
            "questions": [
                {
                    "word": "chlieb",
                    "direction": "sk-en",
                    "choices": ["bread", "butter", "milk", "cheese"],
                    "correctIndex": 0,
                    "explanation": "Basic food word",
                },
                {
                    "word": "water",
                    "direction": "en-sk",
                    "choices": ["mlieko", "voda", "pivo", "čaj"],
                    "correctIndex": 1,
                    "explanation": "Essential vocabulary",
                },
            ],
            "currentIndex": 0,
            "answers": [None, None],
            "retryQueue": [],
            "phase": "questions",
        },
        "feedback": None,
        "messages": [],
    }
    await db_create_session(db, session)
    return session


class TestVocabAnswerBounds:
    async def test_valid_answer_accepted(self, db, active_vocab_session):
        result = await submit_vocab_answer(db, active_vocab_session["id"], 0)
        assert result["exercises"]["answers"][0] == 0

    async def test_negative_choice_index_rejected(self, db, active_vocab_session):
        with pytest.raises(ValueError, match="choice_index"):
            await submit_vocab_answer(db, active_vocab_session["id"], -1)

    async def test_out_of_range_choice_index_rejected(self, db, active_vocab_session):
        with pytest.raises(ValueError, match="choice_index"):
            await submit_vocab_answer(db, active_vocab_session["id"], 4)

    async def test_rejected_answer_not_stored(self, db, active_vocab_session):
        with pytest.raises(ValueError):
            await submit_vocab_answer(db, active_vocab_session["id"], 99)
        # Session must be untouched: still on question 0, nothing recorded
        from app.database import get_session as db_get_session

        session = await db_get_session(db, active_vocab_session["id"])
        assert session["exercises"]["answers"] == [None, None]
        assert session["exercises"]["currentIndex"] == 0
        assert session["exercises"]["retryQueue"] == []


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

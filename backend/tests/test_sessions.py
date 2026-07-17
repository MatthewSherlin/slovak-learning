"""Tests for session answer submission logic."""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio

from app.database import create_session as db_create_session
from app.sessions import submit_vocab_answer


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

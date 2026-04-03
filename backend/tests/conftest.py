"""Shared fixtures for Slovak Learning backend tests."""

from __future__ import annotations

import json
import os
import tempfile
import uuid
from pathlib import Path

import aiosqlite
import pytest
import pytest_asyncio

# Point the DB at a temp file before importing app code
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["SLOVAK_DB_PATH"] = _tmp.name
os.environ.setdefault("SLOVAK_ANTHROPIC_API_KEY", "test-key")

from app.database import init_db, get_db  # noqa: E402


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def _init_schema():
    """Initialize the DB schema once for the entire test session."""
    await init_db()


@pytest_asyncio.fixture
async def db(_init_schema):
    """Provide a database connection for each test."""
    async with get_db() as conn:
        yield conn


@pytest.fixture
def sample_vocab_session() -> dict:
    """A completed vocabulary session with exercises and feedback.

    Uses a unique ID each time to avoid duplicate key conflicts.
    """
    return {
        "id": f"test-vocab-{uuid.uuid4().hex[:8]}",
        "user_id": "matt",
        "mode": "vocabulary",
        "topic": "food_drink",
        "difficulty": "beginner",
        "completed": True,
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
                {
                    "word": "mäso",
                    "direction": "sk-en",
                    "choices": ["fish", "meat", "chicken", "pork"],
                    "correctIndex": 1,
                    "explanation": "Note the ä diacritic",
                },
            ],
            "currentIndex": 3,
            "answers": [0, 1, 0],  # correct, correct, wrong (chose "fish" not "meat")
            "retryQueue": [],
            "phase": "complete",
        },
        "feedback": {
            "overall_score": 7.5,
            "scores": [
                {"category": "Retention", "score": 8, "comment": "Good"},
            ],
            "strengths": ["Quick recall"],
            "improvements": ["Diacritics"],
            "sample_answer": None,
            "vocabulary_learned": [
                {"slovak": "chlieb", "english": "bread", "example": "Chcem chlieb."},
                {"slovak": "voda", "english": "water", "example": "Dajte mi vodu."},
                {"slovak": "mäso", "english": "meat", "example": "Mäso je drahé."},
            ],
            "grammar_notes": [],
        },
        "messages": [],
    }


@pytest.fixture
def sample_grammar_session() -> dict:
    """A completed grammar session with exercises and feedback."""
    return {
        "id": f"test-grammar-{uuid.uuid4().hex[:8]}",
        "user_id": "matt",
        "mode": "grammar",
        "topic": "noun_cases",
        "difficulty": "beginner",
        "completed": True,
        "created_at": "2025-01-16T10:00:00+00:00",
        "exercises": {
            "type": "grammar",
            "lesson": {
                "concept": "Accusative Case",
                "explanation": "Used for direct objects.",
                "examples": ["Vidím dom.", "Mám knihu."],
                "table": None,
            },
            "exercises": [
                {
                    "sentence": "Vidím ____.",
                    "blank": "dom",
                    "hint": "house",
                    "explanation": "Masculine inanimate nouns stay the same.",
                },
                {
                    "sentence": "Mám ____.",
                    "blank": "knihu",
                    "hint": "book (feminine)",
                    "explanation": "Feminine nouns change -a to -u.",
                },
            ],
            "currentIndex": 2,
            "answers": ["dom", "knihy"],  # correct, wrong
            "correct": [True, False],
            "phase": "complete",
        },
        "feedback": {
            "overall_score": 6.0,
            "scores": [
                {"category": "Rule Understanding", "score": 7, "comment": "Good grasp"},
            ],
            "strengths": ["Basic case understanding"],
            "improvements": ["Feminine noun endings"],
            "sample_answer": None,
            "vocabulary_learned": [
                {"slovak": "dom", "english": "house", "example": "Vidím dom."},
                {"slovak": "kniha", "english": "book", "example": "Mám knihu."},
            ],
            "grammar_notes": ["Accusative case changes feminine -a to -u"],
        },
        "messages": [],
    }


@pytest.fixture
def sample_conversation_session() -> dict:
    """A completed conversation session with feedback."""
    return {
        "id": f"test-convo-{uuid.uuid4().hex[:8]}",
        "user_id": "matt",
        "mode": "conversation",
        "topic": "shopping",
        "difficulty": "beginner",
        "completed": True,
        "created_at": "2025-01-17T10:00:00+00:00",
        "exercises": {
            "type": "conversation",
            "scenario": "Shopping at a grocery store",
            "exchangeCount": 5,
            "maxExchanges": 10,
            "phase": "complete",
        },
        "feedback": {
            "overall_score": 7.0,
            "scores": [],
            "strengths": ["Good engagement"],
            "improvements": ["Expand vocabulary"],
            "sample_answer": None,
            "vocabulary_learned": [
                {"slovak": "obchod", "english": "shop", "example": "Idem do obchodu."},
                {"slovak": "peniaze", "english": "money", "example": "Nemám peniaze."},
            ],
            "grammar_notes": ["Genitive case after 'do'"],
        },
        "messages": [
            {"role": "tutor", "content": "Dobrý deň!"},
            {"role": "student", "content": "Dobrý deň, chcem kúpiť chlieb."},
        ],
    }

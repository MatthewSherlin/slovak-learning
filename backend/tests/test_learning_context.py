"""Tests for the learning context builder that injects history into LLM prompts."""

from __future__ import annotations

import json
import uuid

import pytest
import pytest_asyncio

from app.database import (
    create_session as db_create_session,
    update_session as db_update_session,
    update_user_preferences,
    upsert_vocab_progress,
)
from app.sessions import _get_learning_context


pytestmark = pytest.mark.asyncio


async def _seed_completed_session(db, session: dict) -> None:
    """Helper to insert a completed session into the DB."""
    await db_create_session(db, session)
    if session.get("feedback"):
        await db_update_session(
            db,
            session["id"],
            completed=True,
            feedback_json=session["feedback"],
        )


class TestLearningContextEmpty:
    """Tests when user has no history."""

    async def test_empty_for_new_user(self, db):
        # Use a user ID that no other test touches to avoid shared-DB pollution
        context = await _get_learning_context(db, "fresh_user_lc", "vocabulary")
        assert context == ""

    async def test_empty_string_type(self, db):
        context = await _get_learning_context(db, "fresh_user_lc", "grammar")
        assert isinstance(context, str)


class TestLearningContextVocabProgress:
    """Tests for the vocabulary progress section of the context."""

    @pytest_asyncio.fixture
    async def user_with_vocab(self, db):
        """Seed matt with some vocabulary progress."""
        words = [
            {"slovak": "chlieb", "english": "bread", "correct": True, "source_mode": "vocabulary"},
            {"slovak": "voda", "english": "water", "correct": True, "source_mode": "vocabulary"},
            {"slovak": "mäso", "english": "meat", "correct": False, "source_mode": "vocabulary"},
            {"slovak": "pivo", "english": "beer", "correct": False, "source_mode": "vocabulary"},
        ]
        await upsert_vocab_progress(db, "matt", words)
        return "matt"

    async def test_includes_total_words(self, db, user_with_vocab):
        context = await _get_learning_context(db, user_with_vocab, "vocabulary")
        assert "Total unique words practiced:" in context

    async def test_includes_weak_words(self, db, user_with_vocab):
        context = await _get_learning_context(db, user_with_vocab, "vocabulary")
        assert "Words the student struggles with:" in context

    async def test_includes_vocab_progress_header(self, db, user_with_vocab):
        context = await _get_learning_context(db, user_with_vocab, "vocabulary")
        assert "[Student's vocabulary progress]" in context


class TestLearningContextSessionHistory:
    """Tests for the session history digest section."""

    @pytest_asyncio.fixture
    async def user_with_sessions(self, db, sample_vocab_session):
        """Seed matt with a completed vocab session."""
        await _seed_completed_session(db, sample_vocab_session)
        return "matt"

    async def test_includes_session_history(self, db, user_with_sessions):
        context = await _get_learning_context(db, user_with_sessions, "vocabulary")
        assert "[Recent vocabulary session history]" in context

    async def test_includes_score(self, db, user_with_sessions):
        context = await _get_learning_context(db, user_with_sessions, "vocabulary")
        assert "score:" in context

    async def test_includes_topics_covered(self, db, user_with_sessions):
        context = await _get_learning_context(db, user_with_sessions, "vocabulary")
        assert "Previously covered topics:" in context

    async def test_mode_specific_history(self, db, user_with_sessions):
        """Grammar context should not include vocab session history."""
        context = await _get_learning_context(db, user_with_sessions, "grammar")
        # Should NOT have "Recent grammar session history" since we only seeded vocab
        assert "[Recent grammar session history]" not in context


class TestLearningContextFocusAreas:
    """Tests for the custom focus areas section."""

    @pytest_asyncio.fixture
    async def user_with_focus(self, db):
        """Seed matt with custom focus areas."""
        await update_user_preferences(db, "matt", ["restaurant vocabulary", "accusative case"])
        return "matt"

    async def test_includes_focus_areas(self, db, user_with_focus):
        context = await _get_learning_context(db, user_with_focus, "vocabulary")
        assert "[Student's custom focus areas]" in context
        assert "restaurant vocabulary" in context
        assert "accusative case" in context

    async def test_no_focus_section_when_empty(self, db):
        """No focus section when user has no custom areas set."""
        await update_user_preferences(db, "zuki", [])
        context = await _get_learning_context(db, "zuki", "vocabulary")
        assert "[Student's custom focus areas]" not in context


class TestLearningContextCombined:
    """Tests for the full combined context."""

    @pytest_asyncio.fixture
    async def fully_seeded_user(self, db, sample_vocab_session):
        """Seed matt with vocab progress, sessions, and focus areas."""
        # Vocab progress
        words = [
            {"slovak": "dobrý", "english": "good", "correct": True, "source_mode": "vocabulary"},
        ]
        await upsert_vocab_progress(db, "matt", words)

        # Completed session
        # Use a unique session ID to avoid conflicts across test runs
        session = {**sample_vocab_session, "id": f"test-combined-{uuid.uuid4().hex[:8]}"}
        await _seed_completed_session(db, session)

        # Focus areas
        await update_user_preferences(db, "matt", ["travel phrases"])

        return "matt"

    async def test_all_three_sections_present(self, db, fully_seeded_user):
        context = await _get_learning_context(db, fully_seeded_user, "vocabulary")
        assert "[Student's vocabulary progress]" in context
        assert "[Recent vocabulary session history]" in context
        assert "[Student's custom focus areas]" in context

    async def test_sections_separated_by_newlines(self, db, fully_seeded_user):
        context = await _get_learning_context(db, fully_seeded_user, "vocabulary")
        # Sections should be separated by double newlines
        assert "\n\n" in context

    async def test_context_is_reasonable_length(self, db, fully_seeded_user):
        """Context should be concise enough for prompt injection."""
        context = await _get_learning_context(db, fully_seeded_user, "vocabulary")
        # Should be under ~2000 chars (well within 500 tokens)
        assert len(context) < 2000

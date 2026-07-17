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

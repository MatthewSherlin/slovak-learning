"""Tests for the new API endpoints: preferences, vocabulary, and updated dashboard."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import (
    get_db,
    upsert_vocab_progress,
    update_user_preferences,
)
from app.main import app


pytestmark = pytest.mark.asyncio


@pytest.fixture
def client(_init_schema):
    """Provide an async HTTP test client.

    Depends on _init_schema to ensure the DB tables exist before
    any API calls (the FastAPI lifespan doesn't run with ASGITransport).
    """
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


# ── Preferences Endpoints ────────────────────────────────────────────


async def test_get_preferences_default(client):
    """GET preferences for user with none set returns empty defaults."""
    async with client as c:
        resp = await c.get("/api/users/matt/preferences")
    assert resp.status_code == 200
    data = resp.json()
    assert data["user_id"] == "matt"
    assert isinstance(data["custom_focus_areas"], list)


async def test_put_preferences(client):
    """PUT preferences should store and return updated values."""
    async with client as c:
        resp = await c.put(
            "/api/users/matt/preferences",
            json={"custom_focus_areas": ["medical terms", "food vocabulary"]},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["custom_focus_areas"] == ["medical terms", "food vocabulary"]
    assert data["updated_at"] is not None


async def test_get_preferences_after_put(client):
    """GET after PUT should return the previously set values."""
    async with client as c:
        await c.put(
            "/api/users/zuki/preferences",
            json={"custom_focus_areas": ["travel phrases"]},
        )
        resp = await c.get("/api/users/zuki/preferences")
    assert resp.status_code == 200
    data = resp.json()
    assert data["custom_focus_areas"] == ["travel phrases"]


async def test_put_preferences_empty_list(client):
    """PUT with empty list should clear focus areas."""
    async with client as c:
        await c.put("/api/users/matt/preferences", json={"custom_focus_areas": ["something"]})
        resp = await c.put("/api/users/matt/preferences", json={"custom_focus_areas": []})
    assert resp.status_code == 200
    assert resp.json()["custom_focus_areas"] == []


async def test_put_preferences_invalid_body(client):
    """PUT with invalid body should return 422."""
    async with client as c:
        resp = await c.put("/api/users/matt/preferences", json={"wrong_field": "test"})
    assert resp.status_code == 422


# ── Vocabulary Endpoint ──────────────────────────────────────────────


async def test_get_vocabulary_empty(client):
    """GET vocabulary for user with no progress returns zeros."""
    # Use a user not touched by other tests to avoid shared-DB pollution
    async with client as c:
        resp = await c.get("/api/users/fresh_api_user/vocabulary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["stats"]["total_words"] == 0
    assert data["words"] == []
    assert data["weak_words"] == []


async def test_get_vocabulary_with_data(client):
    """GET vocabulary after seeding should return progress data."""
    # Seed directly via database
    async with get_db() as db:
        await upsert_vocab_progress(db, "matt", [
            {"slovak": "stôl", "english": "table", "correct": True, "source_mode": "vocabulary"},
            {"slovak": "stolička", "english": "chair", "correct": False, "source_mode": "vocabulary"},
        ])

    async with client as c:
        resp = await c.get("/api/users/matt/vocabulary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["stats"]["total_words"] >= 2
    assert len(data["words"]) >= 2

    # Check word structure
    word = data["words"][0]
    assert "slovak" in word
    assert "english" in word
    assert "times_seen" in word
    assert "times_correct" in word


# ── Dashboard Endpoint ───────────────────────────────────────────────


async def test_dashboard_includes_vocab_stats(client):
    """Dashboard should include vocab_stats when user_id is provided."""
    async with client as c:
        resp = await c.get("/api/dashboard", params={"user_id": "matt"})
    assert resp.status_code == 200
    data = resp.json()
    assert "vocab_stats" in data
    assert "total_words" in data["vocab_stats"]
    assert "mastered" in data["vocab_stats"]
    assert "learning" in data["vocab_stats"]
    assert "new_or_weak" in data["vocab_stats"]
    assert "weak_words" in data["vocab_stats"]


async def test_dashboard_without_user_id(client):
    """Dashboard without user_id should still work (no vocab_stats)."""
    async with client as c:
        resp = await c.get("/api/dashboard")
    assert resp.status_code == 200
    data = resp.json()
    # vocab_stats is only added when user_id is provided
    assert "vocab_stats" not in data


# ── Health Check ─────────────────────────────────────────────────────


async def test_health(client):
    """Basic health check should still work."""
    async with client as c:
        resp = await c.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ── Users Endpoint ───────────────────────────────────────────────────


async def test_users_endpoint(client):
    """Users endpoint should return seeded users."""
    async with client as c:
        resp = await c.get("/api/users")
    assert resp.status_code == 200
    data = resp.json()
    ids = [u["id"] for u in data]
    assert "matt" in ids
    assert "zuki" in ids

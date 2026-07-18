"""Tests for request input hardening — focus_areas limits and user existence."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def client(_init_schema):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
class TestFocusAreasLimits:
    async def test_too_many_focus_areas_rejected(self, client):
        async with client as c:
            resp = await c.post("/api/sessions", json={
                "user_id": "matt",
                "mode": "vocabulary",
                "focus_areas": [f"area {i}" for i in range(11)],
            })
        assert resp.status_code == 422

    async def test_oversized_focus_area_rejected(self, client):
        async with client as c:
            resp = await c.post("/api/sessions", json={
                "user_id": "matt",
                "mode": "vocabulary",
                "focus_areas": ["x" * 101],
            })
        assert resp.status_code == 422

    async def test_preferences_focus_areas_limited(self, client):
        async with client as c:
            resp = await c.put("/api/users/matt/preferences", json={
                "custom_focus_areas": ["x" * 101],
            })
        assert resp.status_code == 422

    async def test_reasonable_focus_areas_accepted(self, client):
        async with client as c:
            resp = await c.put("/api/users/matt/preferences", json={
                "custom_focus_areas": ["restaurant vocabulary", "accusative case"],
            })
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestUserExistence:
    async def test_create_session_unknown_user_404(self, client):
        async with client as c:
            resp = await c.post("/api/sessions", json={
                "user_id": "definitely_not_a_user",
                "mode": "vocabulary",
            })
        assert resp.status_code == 404
        assert "user" in resp.json()["detail"].lower()

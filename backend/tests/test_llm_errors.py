"""Tests for LLM failure handling — API errors surface as 502, not raw 500s."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app import sessions as sessions_module
from app.llm import LLMError, _extract_json
from app.main import app


@pytest.fixture
def client(_init_schema):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


class TestExtractJsonRaisesLLMError:
    def test_no_json_raises_llm_error(self):
        with pytest.raises(LLMError):
            _extract_json("I'm sorry, I can't help with that.")

    def test_unrepairable_json_raises_llm_error(self):
        with pytest.raises(LLMError):
            _extract_json("{this is { not json ]")

    def test_llm_error_is_not_value_error(self):
        """LLMError must be distinct from ValueError — the API layer maps
        ValueError to 404 (session not found) and LLMError to 502."""
        assert not issubclass(LLMError, ValueError)


@pytest.mark.asyncio
class TestSessionCreationLLMFailure:
    async def test_create_session_returns_502_on_llm_error(self, client, monkeypatch):
        async def boom(*args, **kwargs):
            raise LLMError("upstream unavailable")

        monkeypatch.setattr(sessions_module, "ask_json", boom)

        async with client as c:
            resp = await c.post("/api/sessions", json={
                "user_id": "matt",
                "mode": "vocabulary",
                "topic": "food_drink",
                "difficulty": "beginner",
            })
        assert resp.status_code == 502
        assert "unavailable" in resp.json()["detail"].lower()

    async def test_end_session_returns_502_on_llm_error(
        self, client, monkeypatch, sample_vocab_session
    ):
        from app.database import create_session as db_create_session, get_db

        session = {**sample_vocab_session, "completed": False, "feedback": None}
        async with get_db() as db:
            await db_create_session(db, session)

        async def boom(*args, **kwargs):
            raise LLMError("upstream unavailable")

        monkeypatch.setattr(sessions_module, "ask_json", boom)

        async with client as c:
            resp = await c.post(f"/api/sessions/{session['id']}/end")
        assert resp.status_code == 502

    async def test_session_not_found_still_404(self, client):
        async with client as c:
            resp = await c.post("/api/sessions/nonexistent/end")
        assert resp.status_code == 404

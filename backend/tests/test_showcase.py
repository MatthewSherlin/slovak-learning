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


class TestUserCardsCopies:
    async def test_user_cards_endpoint_includes_copies_map(self, client):
        uid = await _user_with_card(1)
        async with get_db() as db:
            await add_user_cards(db, uid, [1])  # duplicate → copies 2
            await db.commit()
        async with client as c:
            resp = await c.get(f"/api/users/{uid}/cards")
        assert resp.status_code == 200
        data = resp.json()
        assert data["copies"] == {"1": 2}

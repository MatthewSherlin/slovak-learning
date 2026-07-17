"""Duplicate card trade-in for XP."""

from __future__ import annotations

import uuid

import pytest

from app.database import (
    _get_user_xp_earned,
    add_user_cards,
    get_db,
    get_user_card_copies,
    trade_in_duplicates,
)


pytestmark = pytest.mark.asyncio


async def _user_with_dupes():
    uid = f"trade_{uuid.uuid4().hex[:8]}"
    async with get_db() as db:
        await add_user_cards(db, uid, [1])   # card 1 = common (vodník)
        await add_user_cards(db, uid, [1])   # duplicate
        await add_user_cards(db, uid, [2])   # single copy
        await db.commit()
    return uid


async def test_trade_in_duplicate_gains_xp(_init_schema):
    uid = await _user_with_dupes()
    async with get_db() as db:
        result = await trade_in_duplicates(db, uid, [1])
        assert result == {"traded": [1], "xp_gained": 20}  # common = 20
        copies = await get_user_card_copies(db, uid)
        assert copies[1] == 1  # one copy consumed, card kept
        assert await _get_user_xp_earned(db, uid) == 20


async def test_cannot_trade_single_copy(_init_schema):
    uid = await _user_with_dupes()
    async with get_db() as db:
        assert await trade_in_duplicates(db, uid, [2]) is None


async def test_cannot_trade_unowned_card(_init_schema):
    uid = await _user_with_dupes()
    async with get_db() as db:
        assert await trade_in_duplicates(db, uid, [99]) is None


from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def client(_init_schema):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def test_trade_in_endpoint_success(client):
    uid = await _user_with_dupes()
    async with client as c:
        resp = await c.post(f"/api/users/{uid}/cards/trade-in", json={"card_ids": [1]})
    assert resp.status_code == 200
    assert resp.json()["xp_gained"] == 20


async def test_trade_in_endpoint_rejects_single_copy(client):
    uid = await _user_with_dupes()
    async with client as c:
        resp = await c.post(f"/api/users/{uid}/cards/trade-in", json={"card_ids": [2]})
    assert resp.status_code == 400

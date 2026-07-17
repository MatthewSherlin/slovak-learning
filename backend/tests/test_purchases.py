"""Tests for XP purchase atomicity — double-spend protection on concurrent requests."""

from __future__ import annotations

import asyncio
import uuid

import pytest

from app.database import (
    create_session as db_create_session,
    get_db,
    purchase_farm_item,
    purchase_pack,
)


pytestmark = pytest.mark.asyncio


async def _seed_user_with_xp(sample_vocab_session: dict, session_count: int) -> str:
    """Create a fresh user with `session_count` completed sessions (31 XP each)."""
    user_id = f"race_{uuid.uuid4().hex[:8]}"
    async with get_db() as db:
        for _ in range(session_count):
            session = {
                **sample_vocab_session,
                "id": f"race-{uuid.uuid4().hex[:8]}",
                "user_id": user_id,
            }
            await db_create_session(db, session)
    return user_id


class TestFarmPurchaseRace:
    async def test_concurrent_purchases_cannot_double_spend(
        self, _init_schema, sample_vocab_session
    ):
        # 1 completed session = 31 XP -> affords exactly one 25-XP grass patch
        user_id = await _seed_user_with_xp(sample_vocab_session, 1)

        async def buy(i: int):
            # Each request gets its own connection, like real HTTP requests
            async with get_db() as db:
                return await purchase_farm_item(db, user_id, "grass", i, 0)

        results = await asyncio.gather(*[buy(i) for i in range(4)])
        succeeded = [r for r in results if r]
        assert len(succeeded) == 1, (
            f"expected exactly 1 successful purchase, got {len(succeeded)} — double spend!"
        )

    async def test_sequential_purchase_still_works(self, _init_schema, sample_vocab_session):
        user_id = await _seed_user_with_xp(sample_vocab_session, 1)
        async with get_db() as db:
            item = await purchase_farm_item(db, user_id, "grass", 0, 0)
            assert item is not None
            assert item["item_type"] == "grass"
            # Second purchase must fail: only 6 XP left
            assert await purchase_farm_item(db, user_id, "grass", 1, 0) is None


class TestPackPurchaseRace:
    async def test_concurrent_pack_purchases_cannot_double_spend(
        self, _init_schema, sample_vocab_session
    ):
        # 5 completed sessions = 155 XP -> affords exactly one 150-XP pack
        user_id = await _seed_user_with_xp(sample_vocab_session, 5)

        async def buy():
            async with get_db() as db:
                return await purchase_pack(db, user_id, "myty")

        results = await asyncio.gather(*[buy() for _ in range(3)])
        succeeded = [r for r in results if r]
        assert len(succeeded) == 1, (
            f"expected exactly 1 successful pack purchase, got {len(succeeded)} — double spend!"
        )

    async def test_sequential_pack_purchase_still_works(
        self, _init_schema, sample_vocab_session
    ):
        user_id = await _seed_user_with_xp(sample_vocab_session, 5)
        async with get_db() as db:
            result = await purchase_pack(db, user_id, "myty")
            assert result is not None
            assert result["xp_cost"] == 150
            assert len(result["cards"]) > 0
            # Second pack must fail: only 5 XP left
            assert await purchase_pack(db, user_id, "myty") is None

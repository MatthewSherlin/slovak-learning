"""Pack dealing: 5 cards, rare+ guarantee, mythic, duplicate copies."""

from __future__ import annotations

import uuid

import pytest

from app.cards import CARDS, CARDS_BY_SET
from app.database import (
    add_user_cards,
    create_session as db_create_session,
    get_db,
    get_user_card_copies,
    purchase_pack,
)


pytestmark = pytest.mark.asyncio

RARE_PLUS = {"rare", "legendary", "mythic"}


def test_every_set_has_a_mythic():
    for set_id, cards in CARDS_BY_SET.items():
        rarities = [c["rarity"] for c in cards]
        assert "mythic" in rarities, f"set {set_id} missing mythic"


def test_mythic_ids_and_numbers():
    mythics = [c for c in CARDS if c["rarity"] == "mythic"]
    assert len(mythics) == 10
    assert all(c["number"] == 16 for c in mythics)
    assert sorted(c["id"] for c in mythics) == list(range(151, 161))


async def _seed_rich_user(sample_vocab_session):
    """User with plenty of XP (10 completed sessions = 310 XP)."""
    uid = f"pack_{uuid.uuid4().hex[:8]}"
    async with get_db() as db:
        for _ in range(10):
            await db_create_session(db, {
                **sample_vocab_session, "id": f"pk-{uuid.uuid4().hex[:8]}", "user_id": uid,
            })
    return uid


async def test_pack_deals_five_cards(sample_vocab_session, _init_schema):
    uid = await _seed_rich_user(sample_vocab_session)
    async with get_db() as db:
        result = await purchase_pack(db, uid, "myty")
    assert result is not None
    assert len(result["cards"]) == 5


async def test_pack_guarantees_rare_or_better(sample_vocab_session, _init_schema):
    uid = await _seed_rich_user(sample_vocab_session)
    async with get_db() as db:
        result = await purchase_pack(db, uid, "myty")
    rarities = {c["rarity"] for c in result["cards"]}
    assert rarities & RARE_PLUS, f"no rare+ in pack: {rarities}"


async def test_duplicates_increment_copies(_init_schema):
    uid = f"copy_{uuid.uuid4().hex[:8]}"
    async with get_db() as db:
        first = await add_user_cards(db, uid, [1, 2])
        second = await add_user_cards(db, uid, [1, 3])
        await db.commit()  # add_user_cards no longer commits (caller owns txn)
        copies = await get_user_card_copies(db, uid)
    assert first == [1, 2]
    assert second == [3]          # only card 3 is new
    assert copies[1] == 2         # duplicate incremented
    assert copies[2] == 1
    assert copies[3] == 1

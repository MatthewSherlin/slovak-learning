"""Grammar concept mastery tracking."""

from __future__ import annotations

import uuid

import pytest

from app.database import get_weakest_concepts, record_concept_result


pytestmark = pytest.mark.asyncio


async def test_record_and_rank_weakest(db):
    uid = f"cp_{uuid.uuid4().hex[:8]}"
    await record_concept_result(db, uid, "Accusative case", [1.0, 0.0, 0.0, 1.0])   # 50%
    await record_concept_result(db, uid, "Present tense", [1.0, 1.0, 1.0])          # 100%
    weakest = await get_weakest_concepts(db, uid)
    assert weakest[0]["concept"] == "Accusative case"
    assert weakest[0]["accuracy"] == 0.5


async def test_accumulates_across_sessions(db):
    uid = f"cp_{uuid.uuid4().hex[:8]}"
    await record_concept_result(db, uid, "Locative case", [1.0, 1.0])
    await record_concept_result(db, uid, "Locative case", [0.0, 0.0])
    weakest = await get_weakest_concepts(db, uid)
    assert weakest[0]["times_seen"] == 4
    assert weakest[0]["accuracy"] == 0.5


async def test_low_sample_concepts_excluded(db):
    uid = f"cp_{uuid.uuid4().hex[:8]}"
    await record_concept_result(db, uid, "Vocative", [0.0])  # only 1 sample
    assert await get_weakest_concepts(db, uid) == []


async def test_partial_credit_counts_fractionally(db):
    uid = f"cp_{uuid.uuid4().hex[:8]}"
    await record_concept_result(db, uid, "Diacritics", [0.8, 0.8, 0.8])
    weakest = await get_weakest_concepts(db, uid)
    assert weakest[0]["accuracy"] == 0.8

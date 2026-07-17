"""Spaced-repetition scheduling on vocabulary_progress."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.database import get_db, get_due_words, get_vocab_progress, upsert_vocab_progress


pytestmark = pytest.mark.asyncio


def _word(slovak, correct):
    return {"slovak": slovak, "english": "x", "correct": correct, "source_mode": "vocabulary"}


async def _row(db, user_id, slovak):
    cursor = await db.execute(
        "SELECT slovak, due_at, interval_days FROM vocabulary_progress WHERE user_id = ? AND slovak = ?",
        (user_id, slovak),
    )
    return dict(await cursor.fetchone())


async def test_new_correct_word_due_tomorrow(db):
    uid = f"srs_{uuid.uuid4().hex[:8]}"
    await upsert_vocab_progress(db, uid, [_word("chlieb", True)])
    row = await _row(db, uid, "chlieb")
    assert row["interval_days"] == 1
    due = datetime.fromisoformat(row["due_at"])
    assert due > datetime.now(timezone.utc) + timedelta(hours=12)


async def test_new_wrong_word_due_now(db):
    uid = f"srs_{uuid.uuid4().hex[:8]}"
    await upsert_vocab_progress(db, uid, [_word("voda", False)])
    row = await _row(db, uid, "voda")
    due = datetime.fromisoformat(row["due_at"])
    assert due <= datetime.now(timezone.utc)


async def test_repeat_correct_grows_interval(db):
    uid = f"srs_{uuid.uuid4().hex[:8]}"
    await upsert_vocab_progress(db, uid, [_word("mäso", True)])
    await upsert_vocab_progress(db, uid, [_word("mäso", True)])
    row = await _row(db, uid, "mäso")
    assert row["interval_days"] == 2.5


async def test_wrong_answer_resets_interval(db):
    uid = f"srs_{uuid.uuid4().hex[:8]}"
    await upsert_vocab_progress(db, uid, [_word("pivo", True)])
    await upsert_vocab_progress(db, uid, [_word("pivo", True)])
    await upsert_vocab_progress(db, uid, [_word("pivo", False)])
    row = await _row(db, uid, "pivo")
    assert row["interval_days"] == 1


async def test_interval_capped_at_60(db):
    uid = f"srs_{uuid.uuid4().hex[:8]}"
    for _ in range(10):
        await upsert_vocab_progress(db, uid, [_word("syr", True)])
    row = await _row(db, uid, "syr")
    assert row["interval_days"] == 60


async def test_get_due_words(db):
    uid = f"srs_{uuid.uuid4().hex[:8]}"
    await upsert_vocab_progress(db, uid, [_word("zlý", False), _word("dobrý", True)])
    due = await get_due_words(db, uid)
    slovaks = [w["slovak"] for w in due]
    assert "zlý" in slovaks       # wrong -> due now
    assert "dobrý" not in slovaks  # correct -> due tomorrow

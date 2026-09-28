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


async def test_init_backfills_null_due_at(db):
    """Legacy rows (pre-SRS migration) with NULL due_at must become due
    immediately, not vanish from the review loop."""
    import uuid as _uuid
    from app.database import get_due_words, init_db

    uid = f"legacy_{_uuid.uuid4().hex[:8]}"
    await db.execute(
        "INSERT OR IGNORE INTO users (id, name, avatar, color) VALUES (?, 'L', 'L', '#000')",
        (uid,),
    )
    await db.execute(
        """INSERT INTO vocabulary_progress
           (user_id, slovak, english, times_seen, times_correct, last_seen_at,
            source_mode, created_at, due_at, interval_days)
           VALUES (?, 'hrad', 'castle', 3, 3, '2026-01-01T00:00:00+00:00',
                   'vocabulary', '2026-01-01T00:00:00+00:00', NULL, NULL)""",
        (uid,),
    )
    await db.commit()

    await init_db()  # re-running init applies the backfill

    due = await get_due_words(db, uid)
    assert [w["slovak"] for w in due] == ["hrad"]

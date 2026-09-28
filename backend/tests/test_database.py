"""Tests for database schema, vocabulary progress CRUD, and user preferences."""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio

from app.database import (
    get_user_preferences,
    get_vocab_progress,
    get_vocab_stats,
    get_weak_words,
    init_db,
    update_user_preferences,
    upsert_vocab_progress,
)


pytestmark = pytest.mark.asyncio


# ── Schema Tests ─────────────────────────────────────────────────────


async def test_schema_creates_vocabulary_progress_table(db):
    """vocabulary_progress table should exist after init."""
    cursor = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='vocabulary_progress'"
    )
    row = await cursor.fetchone()
    assert row is not None
    assert row["name"] == "vocabulary_progress"


async def test_schema_creates_user_preferences_table(db):
    """user_preferences table should exist after init."""
    cursor = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='user_preferences'"
    )
    row = await cursor.fetchone()
    assert row is not None
    assert row["name"] == "user_preferences"


async def test_schema_creates_vocab_unique_index(db):
    """Unique index on (user_id, slovak) should exist."""
    cursor = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_vocab_user_word'"
    )
    row = await cursor.fetchone()
    assert row is not None


async def test_default_users_seeded(db):
    """Matt and Zuki should be in the users table."""
    cursor = await db.execute("SELECT id FROM users ORDER BY id")
    rows = await cursor.fetchall()
    ids = [r["id"] for r in rows]
    assert "matt" in ids
    assert "zuki" in ids


# ── Vocabulary Progress CRUD ─────────────────────────────────────────


async def test_upsert_vocab_inserts_new_words(db):
    """First upsert should create new records."""
    words = [
        {"slovak": "Chlieb", "english": "bread", "correct": True, "source_mode": "vocabulary"},
        {"slovak": "voda", "english": "water", "correct": False, "source_mode": "vocabulary"},
    ]
    await upsert_vocab_progress(db, "matt", words)

    result = await get_vocab_progress(db, "matt")
    slovaks = {r["slovak"] for r in result}
    assert "chlieb" in slovaks  # normalized to lowercase
    assert "voda" in slovaks


async def test_upsert_vocab_increments_on_duplicate(db):
    """Second upsert of the same word should increment times_seen."""
    words = [
        {"slovak": "chlieb", "english": "bread", "correct": True, "source_mode": "vocabulary"},
    ]
    await upsert_vocab_progress(db, "matt", words)

    result = await get_vocab_progress(db, "matt")
    chlieb = next(r for r in result if r["slovak"] == "chlieb")
    assert chlieb["times_seen"] >= 2  # was inserted in previous test, now incremented
    assert chlieb["times_correct"] >= 2  # both times correct


async def test_upsert_vocab_skips_empty_slovak(db):
    """Words with empty slovak string should be skipped."""
    initial = await get_vocab_progress(db, "matt")
    initial_count = len(initial)

    words = [{"slovak": "", "english": "nothing", "correct": True, "source_mode": "vocabulary"}]
    await upsert_vocab_progress(db, "matt", words)

    after = await get_vocab_progress(db, "matt")
    assert len(after) == initial_count


async def test_upsert_vocab_normalizes_whitespace(db):
    """Leading/trailing whitespace should be stripped."""
    words = [
        {"slovak": "  pivo  ", "english": "  beer  ", "correct": True, "source_mode": "vocabulary"},
    ]
    await upsert_vocab_progress(db, "matt", words)

    result = await get_vocab_progress(db, "matt")
    pivo = next((r for r in result if r["slovak"] == "pivo"), None)
    assert pivo is not None
    assert pivo["english"] == "beer"


async def test_get_vocab_progress_ordered_by_last_seen(db):
    """Results should be ordered by last_seen_at descending."""
    result = await get_vocab_progress(db, "matt")
    if len(result) >= 2:
        # The most recently upserted word should be first
        assert result[0]["last_seen_at"] >= result[-1]["last_seen_at"]


async def test_get_vocab_progress_empty_for_new_user(db):
    """A user with no vocab progress should return empty list."""
    result = await get_vocab_progress(db, "zuki")
    assert result == []


async def test_get_vocab_stats_returns_counts(db):
    """Stats should return aggregate counts."""
    stats = await get_vocab_stats(db, "matt")
    assert "total_words" in stats
    assert "mastered" in stats
    assert "learning" in stats
    assert "new_or_weak" in stats
    assert stats["total_words"] > 0
    # Sum of categories should equal total
    assert stats["mastered"] + stats["learning"] + stats["new_or_weak"] == stats["total_words"]


async def test_get_vocab_stats_empty_user(db):
    """Stats for user with no vocab should be all zeros."""
    stats = await get_vocab_stats(db, "zuki")
    assert stats["total_words"] == 0
    assert stats["mastered"] == 0


async def test_get_weak_words_returns_lowest_accuracy(db):
    """Should return words sorted by accuracy ascending."""
    # Insert a word the user always gets wrong
    words = [
        {"slovak": "ťažký", "english": "difficult", "correct": False, "source_mode": "vocabulary"},
    ]
    await upsert_vocab_progress(db, "matt", words)

    weak = await get_weak_words(db, "matt", limit=5)
    assert len(weak) > 0
    # The word with 0 correct should be in the weak list
    slovaks = [w["slovak"] for w in weak]
    assert "ťažký" in slovaks


async def test_get_weak_words_respects_limit(db):
    """Should return no more than the specified limit."""
    weak = await get_weak_words(db, "matt", limit=2)
    assert len(weak) <= 2


async def test_vocab_progress_user_isolation(db):
    """Vocab progress for one user should not appear for another."""
    words = [
        {"slovak": "pes", "english": "dog", "correct": True, "source_mode": "vocabulary"},
    ]
    await upsert_vocab_progress(db, "zuki", words)

    matt_vocab = await get_vocab_progress(db, "matt")
    zuki_vocab = await get_vocab_progress(db, "zuki")

    matt_words = {r["slovak"] for r in matt_vocab}
    zuki_words = {r["slovak"] for r in zuki_vocab}

    assert "pes" in zuki_words
    assert "pes" not in matt_words


# ── User Preferences CRUD ───────────────────────────────────────────


async def test_get_preferences_returns_defaults(db):
    """User with no preferences set should get empty defaults."""
    # Use a user not touched by other tests to avoid shared-DB pollution
    prefs = await get_user_preferences(db, "fresh_prefs_user")
    assert prefs["user_id"] == "fresh_prefs_user"
    assert prefs["custom_focus_areas"] == []
    assert prefs["updated_at"] is None


async def test_update_preferences_creates_new(db):
    """First update should create the preferences record."""
    await update_user_preferences(db, "matt", ["restaurant vocabulary", "accusative case"])
    prefs = await get_user_preferences(db, "matt")
    assert prefs["custom_focus_areas"] == ["restaurant vocabulary", "accusative case"]
    assert prefs["updated_at"] is not None


async def test_update_preferences_overwrites(db):
    """Subsequent update should replace the focus areas."""
    await update_user_preferences(db, "matt", ["verb conjugation"])
    prefs = await get_user_preferences(db, "matt")
    assert prefs["custom_focus_areas"] == ["verb conjugation"]


async def test_update_preferences_empty_list(db):
    """Setting empty list should clear focus areas."""
    await update_user_preferences(db, "matt", [])
    prefs = await get_user_preferences(db, "matt")
    assert prefs["custom_focus_areas"] == []


async def test_preferences_user_isolation(db):
    """Preferences for one user should not affect another."""
    await update_user_preferences(db, "matt", ["topic A"])
    await update_user_preferences(db, "zuki", ["topic B"])

    matt_prefs = await get_user_preferences(db, "matt")
    zuki_prefs = await get_user_preferences(db, "zuki")

    assert matt_prefs["custom_focus_areas"] == ["topic A"]
    assert zuki_prefs["custom_focus_areas"] == ["topic B"]


# ── get_db error handling ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_db_rolls_back_on_exception(_init_schema):
    """Uncommitted writes inside a failed get_db block must not persist."""
    from app.database import get_db

    marker_id = "rollback-test-user"
    with pytest.raises(RuntimeError):
        async with get_db() as db:
            await db.execute(
                "INSERT INTO users (id, name, avatar, color) VALUES (?, 'X', 'X', '#000')",
                (marker_id,),
            )
            raise RuntimeError("boom before commit")

    async with get_db() as db:
        cursor = await db.execute("SELECT id FROM users WHERE id = ?", (marker_id,))
        assert await cursor.fetchone() is None, "partial write leaked through"


# ── Dashboard / Leaderboard vocab counts ─────────────────────────────


async def test_dashboard_vocab_count_uses_vocabulary_progress(db):
    """vocab_count must reflect unique tracked words, not per-session
    feedback sums (which double-count words across sessions)."""
    from app.database import create_session, get_dashboard_stats, update_session

    words = [
        {"slovak": "voda", "english": "water", "correct": True, "source_mode": "vocabulary"},
        {"slovak": "chlieb", "english": "bread", "correct": True, "source_mode": "vocabulary"},
    ]
    await upsert_vocab_progress(db, "matt", words)
    # Session feedback claims 3 words learned (one overlapping) — must not inflate.
    feedback = {
        "overall_score": 8,
        "vocabulary_learned": [
            {"slovak": "voda", "english": "water"},
            {"slovak": "mlieko", "english": "milk"},
            {"slovak": "syr", "english": "cheese"},
        ],
    }
    session = {
        "id": "dash-test-1",
        "user_id": "matt",
        "mode": "vocabulary",
        "topic": "general",
        "difficulty": "beginner",
        "completed": False,
        "created_at": "2025-01-15T10:00:00+00:00",
        "feedback": None,
        "exercises": None,
        "messages": [],
    }
    await create_session(db, session)
    await update_session(db, "dash-test-1", completed=True, feedback_json=feedback)

    # The db fixture shares one database across the test session, so assert
    # against the table count rather than an absolute number.
    cursor = await db.execute(
        "SELECT COUNT(*) AS total FROM vocabulary_progress WHERE user_id = 'matt'"
    )
    tracked = (await cursor.fetchone())["total"]
    stats = await get_dashboard_stats(db, "matt")
    assert stats["vocab_count"] == tracked


async def test_leaderboard_total_vocab_uses_vocabulary_progress(db):
    from app.database import get_leaderboard

    await upsert_vocab_progress(
        db, "zuki",
        [{"slovak": "dom", "english": "house", "correct": True, "source_mode": "vocabulary"}],
    )
    cursor = await db.execute(
        "SELECT COUNT(*) AS total FROM vocabulary_progress WHERE user_id = 'zuki'"
    )
    tracked = (await cursor.fetchone())["total"]
    entries = await get_leaderboard(db)
    zuki = next(e for e in entries if e["user_id"] == "zuki")
    assert zuki["total_vocab"] == tracked
    assert tracked >= 1


# ── Streak timezone ─────────────────────────────────────────────────


def test_streak_buckets_by_new_york_day():
    """A session at 02:00 UTC belongs to the previous New York calendar day."""
    from datetime import datetime, timedelta, timezone
    from app.database import STREAK_TZ, _calculate_streak

    now_ny = datetime.now(STREAK_TZ)
    # Late-evening NY sessions today and yesterday, expressed in UTC.
    today_utc = now_ny.replace(hour=22, minute=0).astimezone(timezone.utc)
    yesterday_utc = today_utc - timedelta(days=1)
    sessions = [
        {"completed": True, "created_at": today_utc.isoformat()},
        {"completed": True, "created_at": yesterday_utc.isoformat()},
    ]
    assert _calculate_streak(sessions) == 2


# ── init_db cleanup of unusable vocab rows ──────────────────────────


async def test_init_removes_unusable_vocab_rows(db):
    uid = f"clean_{uuid.uuid4().hex[:8]}"
    await db.execute(
        "INSERT OR IGNORE INTO users (id, name, avatar, color) VALUES (?, 'C', 'C', '#000')",
        (uid,),
    )
    rows = [
        ("na zdravie", "all of the above"),
        ("č\u00edt\u0430\u043b", ""),
        ("chlieb", "bread"),
        ("ťažký", "heavy"),
        ("oba", "both"),
        ("ani jeden", "neither"),
    ]
    for slovak, english in rows:
        await db.execute(
            """INSERT INTO vocabulary_progress
               (user_id, slovak, english, times_seen, times_correct, last_seen_at,
                source_mode, created_at, due_at, interval_days)
               VALUES (?, ?, ?, 1, 1, '2026-01-01T00:00:00+00:00', 'vocabulary',
                       '2026-01-01T00:00:00+00:00', '2026-01-02T00:00:00+00:00', 1)""",
            (uid, slovak, english),
        )
    await db.commit()

    await init_db()
    await init_db()  # safe to run repeatedly

    kept = {w["slovak"] for w in await get_vocab_progress(db, uid)}
    assert kept == {"chlieb", "ťažký", "oba", "ani jeden"}

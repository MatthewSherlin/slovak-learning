"""SQLite database layer for Slovak learning app."""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator

import aiosqlite

from .config import settings

log = logging.getLogger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    mode TEXT NOT NULL,
    topic TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    feedback_json TEXT,
    exercises_json TEXT,
    messages_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_mode ON sessions(mode);

CREATE TABLE IF NOT EXISTS vocabulary_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    slovak TEXT NOT NULL,
    english TEXT NOT NULL,
    times_seen INTEGER NOT NULL DEFAULT 1,
    times_correct INTEGER NOT NULL DEFAULT 0,
    last_seen_at TEXT NOT NULL,
    source_mode TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vocab_user_word ON vocabulary_progress(user_id, slovak);
CREATE INDEX IF NOT EXISTS idx_vocab_user ON vocabulary_progress(user_id);

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    custom_focus_areas TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_DEFAULT_USERS = [
    {"id": "matt", "name": "Matt", "avatar": "M", "color": "#5ea4f7"},
    {"id": "zuki", "name": "Zuki", "avatar": "Z", "color": "#f472b6"},
    {"id": "guest", "name": "Guest", "avatar": "G", "color": "#a78bfa"},
]


async def init_db() -> None:
    """Create tables and seed default users."""
    async with aiosqlite.connect(str(settings.db_path)) as db:
        await db.executescript(_SCHEMA)
        for user in _DEFAULT_USERS:
            await db.execute(
                "INSERT OR IGNORE INTO users (id, name, avatar, color) VALUES (?, ?, ?, ?)",
                (user["id"], user["name"], user["avatar"], user["color"]),
            )
        await db.commit()
    log.info("Database initialized at %s", settings.db_path)


@asynccontextmanager
async def get_db() -> AsyncIterator[aiosqlite.Connection]:
    """Yield a database connection."""
    db = await aiosqlite.connect(str(settings.db_path))
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()


# ── User operations ──────────────────────────────────────────────────

async def get_users(db: aiosqlite.Connection) -> list[dict]:
    cursor = await db.execute("SELECT id, name, avatar, color FROM users")
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def get_user(db: aiosqlite.Connection, user_id: str) -> dict | None:
    cursor = await db.execute("SELECT id, name, avatar, color FROM users WHERE id = ?", (user_id,))
    row = await cursor.fetchone()
    return dict(row) if row else None


# ── Session CRUD ─────────────────────────────────────────────────────

async def create_session(db: aiosqlite.Connection, session: dict) -> None:
    await db.execute(
        """INSERT INTO sessions (id, user_id, mode, topic, difficulty, completed, created_at,
           feedback_json, exercises_json, messages_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            session["id"],
            session["user_id"],
            session["mode"],
            session["topic"],
            session["difficulty"],
            int(session.get("completed", False)),
            session["created_at"],
            json.dumps(session.get("feedback")) if session.get("feedback") else None,
            json.dumps(session.get("exercises")) if session.get("exercises") else None,
            json.dumps(session.get("messages", [])),
        ),
    )
    await db.commit()


async def get_session(db: aiosqlite.Connection, session_id: str) -> dict | None:
    cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = await cursor.fetchone()
    if not row:
        return None
    return _row_to_session(row)


async def update_session(db: aiosqlite.Connection, session_id: str, **fields: object) -> None:
    sets: list[str] = []
    vals: list[object] = []
    for key, val in fields.items():
        if key in ("feedback_json", "exercises_json", "messages_json"):
            sets.append(f"{key} = ?")
            vals.append(json.dumps(val) if val is not None else None)
        elif key == "completed":
            sets.append("completed = ?")
            vals.append(int(val))  # type: ignore[arg-type]
        else:
            sets.append(f"{key} = ?")
            vals.append(val)
    vals.append(session_id)
    await db.execute(f"UPDATE sessions SET {', '.join(sets)} WHERE id = ?", vals)
    await db.commit()


async def list_sessions(db: aiosqlite.Connection, user_id: str | None = None) -> list[dict]:
    if user_id:
        cursor = await db.execute(
            "SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC", (user_id,)
        )
    else:
        cursor = await db.execute("SELECT * FROM sessions ORDER BY created_at DESC")
    rows = await cursor.fetchall()
    return [_row_to_session(r) for r in rows]


async def delete_session(db: aiosqlite.Connection, session_id: str) -> bool:
    cursor = await db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    await db.commit()
    return cursor.rowcount > 0


# ── Aggregations ─────────────────────────────────────────────────────

async def get_dashboard_stats(db: aiosqlite.Connection, user_id: str | None = None) -> dict:
    sessions = await list_sessions(db, user_id)
    completed = [s for s in sessions if s["completed"] and s.get("feedback")]

    scores = [s["feedback"]["overall_score"] for s in completed if s.get("feedback")]

    scores_by_mode: dict[str, list[float]] = {}
    all_strengths: list[str] = []
    all_weaknesses: list[str] = []
    total_vocab = 0

    for s in completed:
        fb = s.get("feedback")
        if fb:
            mode = s["mode"]
            scores_by_mode.setdefault(mode, []).append(fb["overall_score"])
            all_strengths.extend(fb.get("strengths", [])[:2])
            all_weaknesses.extend(fb.get("improvements", [])[:2])
            total_vocab += len(fb.get("vocabulary_learned", []))

    avg_by_mode = {m: sum(v) / len(v) for m, v in scores_by_mode.items()}

    recent = _build_summaries(sessions[:5])

    return {
        "total_sessions": len(sessions),
        "completed_sessions": len(completed),
        "avg_score": sum(scores) / len(scores) if scores else None,
        "scores_by_mode": avg_by_mode,
        "strong_areas": list(dict.fromkeys(all_strengths))[:5],
        "weak_areas": list(dict.fromkeys(all_weaknesses))[:5],
        "recent_sessions": recent,
        "vocab_count": total_vocab,
    }


async def get_leaderboard(db: aiosqlite.Connection) -> list[dict]:
    users = await get_users(db)
    sessions = await list_sessions(db)
    entries = []

    for user in users:
        uid = user["id"]
        user_sessions = [s for s in sessions if s["user_id"] == uid]
        completed = [s for s in user_sessions if s["completed"] and s.get("feedback")]
        scores = [s["feedback"]["overall_score"] for s in completed if s.get("feedback")]
        total_vocab = sum(
            len(s["feedback"].get("vocabulary_learned", []))
            for s in completed
            if s.get("feedback")
        )

        entries.append({
            "user_id": uid,
            "name": user["name"],
            "avatar": user["avatar"],
            "color": user["color"],
            "total_sessions": len(user_sessions),
            "completed_sessions": len(completed),
            "avg_score": sum(scores) / len(scores) if scores else None,
            "total_vocab": total_vocab,
            "streak_days": _calculate_streak(user_sessions),
            "xp": _calculate_xp(completed),
        })

    entries.sort(key=lambda e: e["xp"], reverse=True)
    return entries


# ── Helpers ──────────────────────────────────────────────────────────

def _row_to_session(row: aiosqlite.Row) -> dict:
    d = dict(row)
    d["completed"] = bool(d["completed"])
    d["feedback"] = json.loads(d.pop("feedback_json")) if d.get("feedback_json") else None
    d["exercises"] = json.loads(d.pop("exercises_json")) if d.get("exercises_json") else None
    d["messages"] = json.loads(d.pop("messages_json")) if d.get("messages_json") else []
    return d


def _build_summaries(sessions: list[dict]) -> list[dict]:
    summaries = []
    for s in sessions:
        first_msg = s["messages"][0]["content"] if s.get("messages") else ""
        preview = first_msg[:120] + "..." if len(first_msg) > 120 else first_msg
        summaries.append({
            "id": s["id"],
            "user_id": s["user_id"],
            "mode": s["mode"],
            "topic": s["topic"],
            "difficulty": s["difficulty"],
            "completed": s["completed"],
            "overall_score": s["feedback"]["overall_score"] if s.get("feedback") else None,
            "question_preview": preview,
            "created_at": s["created_at"],
        })
    return summaries


def _calculate_xp(completed_sessions: list[dict]) -> int:
    xp = 0
    for s in completed_sessions:
        fb = s.get("feedback")
        if fb:
            xp += 10
            xp += int(fb["overall_score"] * 2)
            xp += len(fb.get("vocabulary_learned", [])) * 2
    return xp


def _calculate_streak(user_sessions: list[dict]) -> int:
    if not user_sessions:
        return 0

    completed_dates: set = set()
    for s in user_sessions:
        if s["completed"]:
            try:
                dt = datetime.fromisoformat(s["created_at"].replace("Z", "+00:00"))
                completed_dates.add(dt.date())
            except Exception:
                pass

    if not completed_dates:
        return 0

    today = datetime.now(timezone.utc).date()
    streak = 0
    current = today

    while current in completed_dates:
        streak += 1
        current -= timedelta(days=1)

    if streak == 0 and (today - timedelta(days=1)) in completed_dates:
        current = today - timedelta(days=1)
        while current in completed_dates:
            streak += 1
            current -= timedelta(days=1)

    return streak


# ── Vocabulary Progress ─────────────────────────────────────────────


async def upsert_vocab_progress(
    db: aiosqlite.Connection,
    user_id: str,
    words: list[dict],
) -> None:
    """Insert or update vocabulary progress for a batch of words."""
    now = datetime.now(timezone.utc).isoformat()
    for w in words:
        slovak = w["slovak"].strip().lower()
        english = w["english"].strip().lower()
        correct_int = int(w.get("correct", False))
        if not slovak:
            continue
        await db.execute(
            """INSERT INTO vocabulary_progress
               (user_id, slovak, english, times_seen, times_correct, last_seen_at, source_mode, created_at)
               VALUES (?, ?, ?, 1, ?, ?, ?, ?)
               ON CONFLICT(user_id, slovak) DO UPDATE SET
                   times_seen = times_seen + 1,
                   times_correct = times_correct + ?,
                   last_seen_at = ?,
                   english = CASE WHEN excluded.english != '' THEN excluded.english ELSE english END""",
            (user_id, slovak, english, correct_int, now, w["source_mode"], now, correct_int, now),
        )
    await db.commit()


async def get_vocab_progress(db: aiosqlite.Connection, user_id: str) -> list[dict]:
    """Get all vocabulary progress for a user, ordered by last_seen_at desc."""
    cursor = await db.execute(
        """SELECT slovak, english, times_seen, times_correct, last_seen_at, source_mode
           FROM vocabulary_progress
           WHERE user_id = ?
           ORDER BY last_seen_at DESC""",
        (user_id,),
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def get_vocab_stats(db: aiosqlite.Connection, user_id: str) -> dict:
    """Get vocabulary summary stats for a user."""
    cursor = await db.execute(
        """SELECT
               COUNT(*) as total_words,
               SUM(CASE WHEN CAST(times_correct AS REAL) / MAX(times_seen, 1) >= 0.8 THEN 1 ELSE 0 END) as mastered,
               SUM(CASE WHEN CAST(times_correct AS REAL) / MAX(times_seen, 1) >= 0.4
                         AND CAST(times_correct AS REAL) / MAX(times_seen, 1) < 0.8 THEN 1 ELSE 0 END) as learning,
               SUM(CASE WHEN CAST(times_correct AS REAL) / MAX(times_seen, 1) < 0.4 THEN 1 ELSE 0 END) as new_or_weak
           FROM vocabulary_progress
           WHERE user_id = ?""",
        (user_id,),
    )
    row = await cursor.fetchone()
    if row:
        d = dict(row)
        return {k: v or 0 for k, v in d.items()}
    return {"total_words": 0, "mastered": 0, "learning": 0, "new_or_weak": 0}


async def get_weak_words(db: aiosqlite.Connection, user_id: str, limit: int = 10) -> list[dict]:
    """Get words with lowest accuracy for a user."""
    cursor = await db.execute(
        """SELECT slovak, english, times_seen, times_correct, last_seen_at, source_mode
           FROM vocabulary_progress
           WHERE user_id = ? AND times_seen >= 1
           ORDER BY CAST(times_correct AS REAL) / MAX(times_seen, 1) ASC, times_seen DESC
           LIMIT ?""",
        (user_id, limit),
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


# ── User Preferences ────────────────────────────────────────────────


async def get_user_preferences(db: aiosqlite.Connection, user_id: str) -> dict:
    """Get user preferences, returning defaults if not set."""
    cursor = await db.execute(
        "SELECT user_id, custom_focus_areas, updated_at FROM user_preferences WHERE user_id = ?",
        (user_id,),
    )
    row = await cursor.fetchone()
    if row:
        d = dict(row)
        d["custom_focus_areas"] = json.loads(d["custom_focus_areas"])
        return d
    return {"user_id": user_id, "custom_focus_areas": [], "updated_at": None}


async def update_user_preferences(
    db: aiosqlite.Connection,
    user_id: str,
    custom_focus_areas: list[str],
) -> None:
    """Upsert user preferences."""
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        """INSERT INTO user_preferences (user_id, custom_focus_areas, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
               custom_focus_areas = ?,
               updated_at = ?""",
        (user_id, json.dumps(custom_focus_areas), now, json.dumps(custom_focus_areas), now),
    )
    await db.commit()

"""Session generation targets due words and weak concepts."""

from __future__ import annotations

import uuid

import pytest

from app import sessions as sessions_module
from app.database import record_concept_result, upsert_vocab_progress
from app.sessions import _create_grammar_session, _create_vocab_session


pytestmark = pytest.mark.asyncio


@pytest.fixture
def capture_llm(monkeypatch):
    captured = {}

    async def fake_ask_json(prompt, system_prompt=None):
        captured["prompt"] = prompt
        return {"questions": [], "lesson": {"concept": "X", "explanation": "", "examples": []}, "exercises": []}

    monkeypatch.setattr(sessions_module, "ask_json", fake_ask_json)
    return captured


async def _seed_user(db, uid):
    await db.execute(
        "INSERT OR IGNORE INTO users (id, name, avatar, color) VALUES (?, 'T', 'T', '#000')",
        (uid,),
    )
    await db.commit()


async def test_vocab_prompt_includes_due_words(db, capture_llm):
    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
    ])
    await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    assert "hrad" in capture_llm["prompt"]
    assert "due for review" in capture_llm["prompt"]


async def test_vocab_prompt_no_due_block_when_none_due(db, capture_llm):
    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    assert "due for review" not in capture_llm["prompt"]


async def test_grammar_targets_weakest_concept_on_general_topic(db, capture_llm):
    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await record_concept_result(db, uid, "Accusative case", [0.0, 0.0, 1.0])
    await _create_grammar_session(db, {"user_id": uid, "mode": "grammar", "topic": "general"})
    assert "Accusative case" in capture_llm["prompt"]


async def test_grammar_explicit_topic_not_overridden(db, capture_llm):
    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await record_concept_result(db, uid, "Accusative case", [0.0, 0.0, 1.0])
    await _create_grammar_session(db, {"user_id": uid, "mode": "grammar", "topic": "verb_conjugation"})
    assert "Accusative case" not in capture_llm["prompt"]

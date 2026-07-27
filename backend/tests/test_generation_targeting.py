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

    def _q(i: int) -> dict:
        return {
            "word": f"slovo{i}",
            "direction": "sk-en",
            "choices": [f"word{i}", f"alt{i}a", f"alt{i}b", f"alt{i}c"],
            "correctIndex": 0,
            "explanation": "",
        }

    async def fake_ask_json(prompt, system_prompt=None):
        captured.setdefault("prompts", []).append(prompt)
        captured["prompt"] = prompt if "prompt" not in captured else captured["prompt"]
        return {
            "questions": [_q(i) for i in range(10)],
            "lesson": {"concept": "X", "explanation": "", "examples": []},
            "exercises": [],
        }

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


async def test_grammar_instructions_in_prompt(db, capture_llm):
    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await _create_grammar_session(db, {
        "user_id": uid, "mode": "grammar", "topic": "noun_cases",
        "instructions": "use food vocabulary in examples",
    })
    assert "[Student's instructions for this session]" in capture_llm["prompt"]
    assert "use food vocabulary in examples" in capture_llm["prompt"]


async def test_translation_instructions_and_review_words(db, capture_llm):
    from app.sessions import _create_translation_session

    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
    ])
    await _create_translation_session(db, {
        "user_id": uid, "mode": "translation", "topic": "english_to_slovak",
        "instructions": "short sentences only",
    })
    assert "short sentences only" in capture_llm["prompt"]
    assert "Weave these review words" in capture_llm["prompt"]
    assert "hrad" in capture_llm["prompt"]


async def test_grammar_lists_recently_covered_concepts(db, capture_llm):
    from app.database import create_session as db_create_session

    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await db_create_session(db, {
        "id": f"gt-prev-{uuid.uuid4().hex[:8]}",
        "user_id": uid, "mode": "grammar", "topic": "noun_cases",
        "difficulty": "beginner", "completed": True,
        "created_at": "2026-07-20T10:00:00+00:00",
        "exercises": {
            "type": "grammar",
            "lesson": {"concept": "Accusative Case", "explanation": "", "examples": [], "table": None},
            "exercises": [], "currentIndex": 0, "answers": [], "correct": [], "phase": "complete",
        },
        "feedback": None, "messages": [],
    })
    await _create_grammar_session(db, {"user_id": uid, "mode": "grammar", "topic": "verb_conjugation"})
    assert "Recently covered concepts" in capture_llm["prompt"]
    assert "Accusative Case" in capture_llm["prompt"]


@pytest.fixture
def capture_messages(monkeypatch):
    captured = {}

    async def fake_ask_messages(messages, system_prompt=None):
        captured.setdefault("system_prompts", []).append(system_prompt)
        captured["messages"] = messages
        return "Ahoj!"

    monkeypatch.setattr(sessions_module, "ask_messages", fake_ask_messages)
    return captured


async def test_conversation_opener_includes_instructions(db, capture_messages):
    from app.sessions import _create_conversation_session

    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    session = await _create_conversation_session(db, {
        "user_id": uid, "mode": "conversation", "topic": "daily_life",
        "instructions": "correct all my mistakes strictly",
    })
    opener_user_msg = capture_messages["messages"][0]["content"]
    assert "correct all my mistakes strictly" in opener_user_msg
    assert session["exercises"]["instructions"] == "correct all my mistakes strictly"


async def test_conversation_turn_includes_instructions(db, capture_messages):
    from app.sessions import _create_conversation_session, submit_conversation_answer

    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    session = await _create_conversation_session(db, {
        "user_id": uid, "mode": "conversation", "topic": "daily_life",
        "instructions": "correct all my mistakes strictly",
    })
    await submit_conversation_answer(db, session["id"], "Ahoj, ako sa máš?")
    turn_system = capture_messages["system_prompts"][-1]
    assert "correct all my mistakes strictly" in turn_system

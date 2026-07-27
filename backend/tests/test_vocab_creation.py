"""Vocab session creation: slot plan, exclusions, instructions, retry."""

from __future__ import annotations

import uuid

import pytest

from app import sessions as sessions_module
from app.database import upsert_vocab_progress
from app.llm import LLMError
from app.sessions import _create_vocab_session


pytestmark = pytest.mark.asyncio


def _q(word: str, correct: str = "x") -> dict:
    return {
        "word": word,
        "direction": "sk-en",
        "choices": [correct, f"{word}-b", f"{word}-c", f"{word}-d"],
        "correctIndex": 0,
        "explanation": "",
    }


async def _seed_user(db, uid):
    await db.execute(
        "INSERT OR IGNORE INTO users (id, name, avatar, color) VALUES (?, 'T', 'T', '#000')",
        (uid,),
    )
    await db.commit()


@pytest.fixture
def llm(monkeypatch):
    """Queue-based fake: each call pops the next canned response."""
    state = {"prompts": [], "responses": []}

    async def fake_ask_json(prompt, system_prompt=None):
        state["prompts"].append(prompt)
        return state["responses"].pop(0)

    monkeypatch.setattr(sessions_module, "ask_json", fake_ask_json)
    return state


async def test_instructions_in_prompt_and_persisted(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    llm["responses"] = [{"questions": [_q(f"s{i}") for i in range(10)]}]
    session = await _create_vocab_session(db, {
        "user_id": uid, "mode": "vocabulary", "topic": "general",
        "instructions": "only verbs please",
    })
    assert "[Student's instructions for this session]" in llm["prompts"][0]
    assert "only verbs please" in llm["prompts"][0]
    assert session["exercises"]["instructions"] == "only verbs please"


async def test_instructions_not_used_as_topic(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    llm["responses"] = [{"questions": [_q(f"s{i}") for i in range(10)]}]
    await _create_vocab_session(db, {
        "user_id": uid, "mode": "vocabulary", "topic": "general",
        "instructions": "don't use words from last session",
    })
    assert "questions about: don't use words" not in llm["prompts"][0]
    assert "MUST be about" not in llm["prompts"][0]


async def test_seen_words_excluded_and_filtered(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    # Seen but NOT due (correct answer schedules future review) and not weak
    await upsert_vocab_progress(db, uid, [
        {"slovak": "kniha", "english": "book", "correct": True, "source_mode": "vocabulary"},
    ])
    # LLM disobeys and returns the excluded word; 10 total so no retry
    llm["responses"] = [{"questions": [_q("kniha")] + [_q(f"s{i}") for i in range(9)]}]
    session = await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    words = [q["word"] for q in session["exercises"]["questions"]]
    assert "kniha" not in words
    assert "kniha" in llm["prompts"][0]  # sent as an exclusion


async def test_due_words_fill_review_slots(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
    ])
    llm["responses"] = [{"questions": [_q("hrad")] + [_q(f"s{i}") for i in range(9)]}]
    session = await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    assert "REQUIRED REVIEW WORDS" in llm["prompts"][0]
    assert "hrad" in llm["prompts"][0]
    assert "hrad" in [q["word"] for q in session["exercises"]["questions"]]


async def test_retry_then_llm_error_when_underdelivering(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    llm["responses"] = [
        {"questions": [_q(f"s{i}") for i in range(3)]},  # first call: 3 valid
        {"questions": []},                                # retry: nothing
    ]
    with pytest.raises(LLMError):
        await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    assert len(llm["prompts"]) == 2


async def test_retry_fills_missing_questions(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    llm["responses"] = [
        {"questions": [_q(f"s{i}") for i in range(3)]},
        {"questions": [_q(f"r{i}") for i in range(7)]},
    ]
    session = await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    assert len(session["exercises"]["questions"]) == 10

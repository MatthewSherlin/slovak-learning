"""end_session: computed scores for objective modes, LLM narrative only."""

from __future__ import annotations

import uuid

import pytest

from app import sessions as sessions_module
from app.database import create_session as db_create_session
from app.sessions import end_session


pytestmark = pytest.mark.asyncio


NARRATIVE_ONLY = {
    "strengths": ["Good recall"],
    "improvements": ["Practice diacritics"],
    "sample_answer": None,
    "vocabulary_learned": [{"slovak": "chlieb", "english": "bread", "example": None}],
    "grammar_notes": [],
}

FULL_LLM = {
    "overall_score": 6.5,
    "scores": [{"category": "Fluency", "score": 7, "comment": "ok"}],
    **NARRATIVE_ONLY,
}


@pytest.fixture
def fake_llm(monkeypatch):
    captured = {}

    async def fake_ask_json(prompt, system_prompt=None, **kwargs):
        captured["prompt"] = prompt
        captured["system"] = system_prompt
        captured["kwargs"] = kwargs
        return dict(FULL_LLM)

    monkeypatch.setattr(sessions_module, "ask_json", fake_ask_json)
    return captured


async def test_vocab_score_computed_not_llm(db, fake_llm, sample_vocab_session):
    session = {
        **sample_vocab_session,
        "id": f"fb-{uuid.uuid4().hex[:8]}",
        "completed": False,
        "feedback": None,
    }
    # 3 questions: answers [0,1,0] vs correctIndex [0,1,1] -> 2/3 correct
    await db_create_session(db, session)
    feedback = await end_session(db, session["id"])
    assert feedback["overall_score"] == 6.67  # (1+1+0)/3*10 rounded
    # categories computed deterministically, not the LLM's "Fluency"
    assert all(s["category"] != "Fluency" for s in feedback["scores"])
    assert feedback["strengths"] == ["Good recall"]  # narrative from LLM


async def test_conversation_score_still_from_llm(db, fake_llm, sample_conversation_session):
    session = {
        **sample_conversation_session,
        "id": f"fb-{uuid.uuid4().hex[:8]}",
        "completed": False,
        "feedback": None,
    }
    await db_create_session(db, session)
    feedback = await end_session(db, session["id"])
    assert feedback["overall_score"] == 6.5
    assert feedback["scores"][0]["category"] == "Fluency"


async def test_feedback_call_uses_schema_and_low_effort(db, fake_llm, sample_vocab_session):
    from app.schemas import FEEDBACK_SCHEMA

    session = {
        **sample_vocab_session,
        "id": f"fb-{uuid.uuid4().hex[:8]}",
        "completed": False,
        "feedback": None,
    }
    await db_create_session(db, session)
    await end_session(db, session["id"])
    assert fake_llm["kwargs"]["schema"] is FEEDBACK_SCHEMA
    assert fake_llm["kwargs"]["effort"] == "low"
    assert fake_llm["kwargs"]["max_tokens"] == 8000


async def test_feedback_prompt_never_says_general(db, fake_llm, sample_vocab_session):
    session = {
        **sample_vocab_session,
        "id": f"fb-{uuid.uuid4().hex[:8]}",
        "topic": "general",
        "completed": False,
        "feedback": None,
    }
    await db_create_session(db, session)
    await end_session(db, session["id"])
    assert "Topic: general" not in fake_llm["prompt"]
    assert "Topic: no set topic" in fake_llm["prompt"]


async def test_end_session_twice_calls_the_model_once(db, monkeypatch, sample_vocab_session):
    calls = {"n": 0}

    async def counting_ask_json(prompt, system_prompt=None, **kwargs):
        calls["n"] += 1
        return dict(FULL_LLM)

    monkeypatch.setattr(sessions_module, "ask_json", counting_ask_json)
    uid = f"fbu_{uuid.uuid4().hex[:8]}"
    session = {
        **sample_vocab_session,
        "id": f"fb-{uuid.uuid4().hex[:8]}",
        "user_id": uid,
        "completed": False,
        "feedback": None,
    }
    await db_create_session(db, session)
    first = await end_session(db, session["id"])
    second = await end_session(db, session["id"])
    assert calls["n"] == 1
    assert second == first

    from app.database import get_vocab_progress

    rows = await get_vocab_progress(db, uid)
    assert {w["times_seen"] for w in rows} == {1}


async def test_progress_survives_a_failed_feedback_call_once(db, monkeypatch, sample_vocab_session):
    from app.database import get_vocab_progress
    from app.llm import LLMError

    state = {"fail": True}

    async def flaky_ask_json(prompt, system_prompt=None, **kwargs):
        if state["fail"]:
            raise LLMError("upstream unavailable")
        return dict(FULL_LLM)

    monkeypatch.setattr(sessions_module, "ask_json", flaky_ask_json)
    uid = f"fbu_{uuid.uuid4().hex[:8]}"
    session = {
        **sample_vocab_session,
        "id": f"fb-{uuid.uuid4().hex[:8]}",
        "user_id": uid,
        "completed": False,
        "feedback": None,
    }
    await db_create_session(db, session)

    with pytest.raises(LLMError):
        await end_session(db, session["id"])
    assert len(await get_vocab_progress(db, uid)) == 3  # saved despite the failure

    state["fail"] = False
    await end_session(db, session["id"])
    rows = await get_vocab_progress(db, uid)
    assert {w["times_seen"] for w in rows} == {1}  # and not saved a second time

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

    async def fake_ask_json(prompt, system_prompt=None):
        captured["prompt"] = prompt
        captured["system"] = system_prompt
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

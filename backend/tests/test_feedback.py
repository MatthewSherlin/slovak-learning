"""end_session: the results are counted from the answers, with no model call."""

from __future__ import annotations

import uuid

import pytest

from app import sessions as sessions_module
from app.database import create_session as db_create_session, get_session, get_vocab_progress
from app.sessions import end_session


pytestmark = pytest.mark.asyncio

MEMO = "\U0001F4DD"

FEEDBACK_FIELDS = {
    "overall_score", "scores", "strengths", "improvements", "sample_answer",
    "vocabulary_learned", "grammar_notes", "items_answered", "items_total", "corrections",
}


@pytest.fixture
def model_calls(monkeypatch):
    calls: list[dict] = []

    async def recording_ask_json(prompt, system_prompt=None, **kwargs):
        calls.append({"prompt": prompt, "system": system_prompt, **kwargs})
        return {}

    monkeypatch.setattr(sessions_module, "ask_json", recording_ask_json)
    return calls


def _unfinished(session: dict, **overrides) -> dict:
    # A user of its own, so completed lessons do not leak into other tests.
    return {
        **session,
        "id": f"fb-{uuid.uuid4().hex[:8]}",
        "user_id": f"fbu_{uuid.uuid4().hex[:8]}",
        "completed": False,
        "feedback": None,
        **overrides,
    }


def _assert_nothing_written_by_a_model(feedback: dict) -> None:
    assert set(feedback) == FEEDBACK_FIELDS
    assert feedback["strengths"] == []
    assert feedback["improvements"] == []
    assert feedback["grammar_notes"] == []
    assert feedback["sample_answer"] is None


async def test_vocabulary_results_from_answers(db, model_calls, sample_vocab_session):
    session = _unfinished(sample_vocab_session)
    # 3 questions: answers [0,1,0] vs correctIndex [0,1,1] -> 2/3 correct
    await db_create_session(db, session)
    feedback = await end_session(db, session["id"])

    assert model_calls == []
    _assert_nothing_written_by_a_model(feedback)
    assert feedback["overall_score"] == 6.67
    assert {s["category"] for s in feedback["scores"]} == {
        "Word recognition (SK→EN)", "Recall (EN→SK)",
    }
    assert feedback["vocabulary_learned"] == [
        {"slovak": "chlieb", "english": "bread", "example": None},
        {"slovak": "voda", "english": "water", "example": None},
        {"slovak": "mäso", "english": "meat", "example": None},
    ]
    assert feedback["items_answered"] == 3
    assert feedback["items_total"] == 3
    assert feedback["corrections"] == []


async def test_vocabulary_items_answered_counts_only_answered_questions(
    db, model_calls, sample_vocab_session,
):
    session = _unfinished(sample_vocab_session)
    session["exercises"]["answers"] = [0, None, None]
    session["exercises"]["credits"] = [1.0, None, None]
    await db_create_session(db, session)
    feedback = await end_session(db, session["id"])
    assert feedback["items_answered"] == 1
    assert feedback["items_total"] == 3


async def test_grammar_results_from_answers(db, model_calls, sample_grammar_session):
    session = _unfinished(sample_grammar_session)
    session["exercises"]["exercises"].append(
        {"sentence": "Pijem ____.", "blank": "vodu", "hint": "", "explanation": ""},
    )
    session["exercises"]["answers"] = ["dom", "knihy", None]
    session["exercises"]["correct"] = [True, False, None]
    session["exercises"]["credits"] = [1.0, 0.0, None]
    await db_create_session(db, session)
    feedback = await end_session(db, session["id"])

    assert model_calls == []
    _assert_nothing_written_by_a_model(feedback)
    assert feedback["overall_score"] == 3.33
    assert feedback["scores"] == [{"category": "Accuracy", "score": 3.33, "comment": ""}]
    assert feedback["vocabulary_learned"] == []
    assert feedback["items_answered"] == 2
    assert feedback["items_total"] == 3
    assert feedback["corrections"] == []


async def test_translation_results_from_answers(db, model_calls):
    session = {
        "id": f"fb-{uuid.uuid4().hex[:8]}",
        "user_id": f"fbu_{uuid.uuid4().hex[:8]}",
        "mode": "translation",
        "topic": "english_to_slovak",
        "difficulty": "beginner",
        "completed": False,
        "created_at": "2025-01-18T10:00:00+00:00",
        "feedback": None,
        "exercises": {
            "type": "translation",
            "exercises": [
                {"kind": "translate", "source": "I want bread", "direction": "en-sk",
                 "translation": None, "modelAnswer": "Chcem chlieb", "keyPoints": []},
                {"kind": "translate", "source": "Water, please", "direction": "en-sk",
                 "translation": None, "modelAnswer": "Vodu, prosím", "keyPoints": []},
            ],
            "answers": [{"userAnswer": "Chcem chlieb", "score": 9, "feedback": "", "tier": "exact"}, None],
            "phase": "active",
        },
        "messages": [],
    }
    await db_create_session(db, session)
    feedback = await end_session(db, session["id"])

    assert model_calls == []
    _assert_nothing_written_by_a_model(feedback)
    assert feedback["overall_score"] == 4.5
    assert feedback["scores"] == [{"category": "Translation quality", "score": 9, "comment": ""}]
    assert feedback["vocabulary_learned"] == []
    assert feedback["items_answered"] == 1
    assert feedback["items_total"] == 2
    assert feedback["corrections"] == []


async def test_conversation_results_have_no_score(db, model_calls, sample_conversation_session):
    session = _unfinished(sample_conversation_session)
    session["messages"] = [
        {"role": "tutor", "content": "Dobrý deň! Čo si želáte?"},
        {"role": "student", "content": "Chcem chlieb."},
        {"role": "tutor", "content": f"Nech sa páči.\n{MEMO} chcem kúpiť chlieb → chcem chlieb"},
        {"role": "system", "content": f"{MEMO} not from the tutor"},
        {"role": "student", "content": "Ďakujem."},
        {"role": "tutor", "content": f"  {MEMO}  ďakujem veľmi pekne  "},
    ]
    await db_create_session(db, session)
    feedback = await end_session(db, session["id"])

    assert model_calls == []
    _assert_nothing_written_by_a_model(feedback)
    assert feedback["overall_score"] is None
    assert feedback["scores"] == []
    assert feedback["vocabulary_learned"] == []
    assert feedback["items_answered"] == 2
    assert feedback["items_total"] == 10
    assert feedback["corrections"] == [
        "chcem kúpiť chlieb → chcem chlieb",
        "ďakujem veľmi pekne",
    ]


async def test_end_session_stores_the_feedback_and_completes(db, model_calls, sample_vocab_session):
    session = _unfinished(sample_vocab_session)
    await db_create_session(db, session)
    feedback = await end_session(db, session["id"])
    stored = await get_session(db, session["id"])
    assert stored["completed"] is True
    assert stored["feedback"] == feedback


async def test_end_session_twice_records_progress_once(db, model_calls, sample_vocab_session):
    uid = f"fbu_{uuid.uuid4().hex[:8]}"
    session = _unfinished(sample_vocab_session, user_id=uid)
    await db_create_session(db, session)
    first = await end_session(db, session["id"])
    second = await end_session(db, session["id"])
    assert second == first
    assert model_calls == []

    rows = await get_vocab_progress(db, uid)
    assert {w["times_seen"] for w in rows} == {1}


async def test_ending_other_lessons_adds_no_words(
    db, model_calls, sample_grammar_session, sample_conversation_session,
):
    uid = f"fbu_{uuid.uuid4().hex[:8]}"
    for fixture in (sample_grammar_session, sample_conversation_session):
        session = _unfinished(fixture, user_id=uid)
        await db_create_session(db, session)
        await end_session(db, session["id"])
    assert await get_vocab_progress(db, uid) == []

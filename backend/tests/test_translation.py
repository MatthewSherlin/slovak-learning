"""Translation sessions: kinds, direction, repeat protection, tolerant grading."""

from __future__ import annotations

import uuid

import pytest

from app import sessions as sessions_module
from app.database import create_session as db_create_session, upsert_vocab_progress
from app.llm import LLMError
from app.schemas import TRANSLATION_BATCH_SCHEMA, TRANSLATION_GRADE_SCHEMA
from app.sessions import _create_translation_session, submit_translation

pytestmark = pytest.mark.asyncio


def _translate(i: int, direction: str = "en-sk") -> dict:
    if direction == "en-sk":
        return {"source": f"English sentence {i}.", "direction": "en-sk", "translation": None,
                "modelAnswer": f"Slovenská veta {i}.", "keyPoints": []}
    return {"source": f"Slovenská veta {i}.", "direction": "sk-en", "translation": None,
            "modelAnswer": f"English sentence {i}.", "keyPoints": []}


def _blank(i: int) -> dict:
    return {"source": f"Veta {i} má ____.", "direction": "en-sk",
            "translation": f"Sentence {i} has a word.", "modelAnswer": f"slovo{i}", "keyPoints": []}


def _broken(i: int) -> dict:
    return {"source": f"Mám voda {i}.", "direction": "en-sk",
            "translation": f"I have water {i}.", "modelAnswer": f"Mám vodu {i}.",
            "keyPoints": ["accusative"]}


@pytest.fixture
def llm(monkeypatch):
    state = {"prompts": [], "systems": [], "kwargs": [], "responses": []}

    async def fake_ask_json(prompt, system_prompt=None, **kwargs):
        state["prompts"].append(prompt)
        state["systems"].append(system_prompt)
        state["kwargs"].append(kwargs)
        return state["responses"].pop(0)

    monkeypatch.setattr(sessions_module, "ask_json", fake_ask_json)
    return state


async def _user(db) -> str:
    uid = f"tr_{uuid.uuid4().hex[:8]}"
    await db.execute(
        "INSERT OR IGNORE INTO users (id, name, avatar, color) VALUES (?, 'T', 'T', '#000')",
        (uid,),
    )
    await db.commit()
    return uid


async def _stored(db, uid: str, items: list[dict], kind: str = "translate") -> str:
    sid = f"tr-{uuid.uuid4().hex[:8]}"
    await db_create_session(db, {
        "id": sid, "user_id": uid, "mode": "translation", "topic": "general",
        "difficulty": "beginner", "completed": False,
        "created_at": "2026-09-01T10:00:00+00:00",
        "exercises": {
            "type": "translation",
            "exercises": [{"kind": kind, **i} for i in items],
            "currentIndex": 0, "answers": [None] * len(items), "phase": "exercises",
        },
        "feedback": None, "messages": [],
    })
    return sid


class TestCreation:
    async def test_slovak_to_english_is_all_one_direction(self, db, llm):
        uid = await _user(db)
        mixed = [_translate(i, "sk-en") for i in range(10)] + [_translate(99, "en-sk")]
        llm["responses"] = [{"exercises": mixed}]
        session = await _create_translation_session(db, {
            "user_id": uid, "mode": "translation", "topic": "slovak_to_english",
        })
        items = session["exercises"]["exercises"]
        assert len(items) == 10
        assert {i["direction"] for i in items} == {"sk-en"}
        assert {i["kind"] for i in items} == {"translate"}
        assert 'direction "sk-en"' in llm["prompts"][0]

    async def test_no_topic_allows_both_directions(self, db, llm):
        uid = await _user(db)
        llm["responses"] = [{"exercises": [
            _translate(i, "en-sk" if i % 2 == 0 else "sk-en") for i in range(10)
        ]}]
        session = await _create_translation_session(db, {
            "user_id": uid, "mode": "translation", "topic": "general",
        })
        assert {i["direction"] for i in session["exercises"]["exercises"]} == {"en-sk", "sk-en"}

    async def test_fill_in_blanks_uses_its_own_prompt_and_kind(self, db, llm):
        from app.prompts import FILL_BLANK_BATCH_PROMPT

        uid = await _user(db)
        llm["responses"] = [{"exercises": [_blank(i) for i in range(10)]}]
        session = await _create_translation_session(db, {
            "user_id": uid, "mode": "translation", "topic": "fill_in_blanks",
        })
        assert llm["systems"][0] is FILL_BLANK_BATCH_PROMPT
        item = session["exercises"]["exercises"][0]
        assert item["kind"] == "fill_blank"
        assert item["translation"] == "Sentence 0 has a word."

    async def test_error_correction_uses_its_own_prompt_and_kind(self, db, llm):
        from app.prompts import ERROR_CORRECTION_BATCH_PROMPT

        uid = await _user(db)
        llm["responses"] = [{"exercises": [_broken(i) for i in range(10)]}]
        session = await _create_translation_session(db, {
            "user_id": uid, "mode": "translation", "topic": "error_correction",
        })
        assert llm["systems"][0] is ERROR_CORRECTION_BATCH_PROMPT
        assert session["exercises"]["exercises"][0]["kind"] == "error_correction"

    async def test_recent_sentences_are_listed_and_filtered(self, db, llm):
        uid = await _user(db)
        await _stored(db, uid, [_translate(1, "sk-en")])
        llm["responses"] = [
            {"exercises": [_translate(1, "sk-en")] + [_translate(i) for i in range(10, 19)]},
            {"exercises": [_translate(50)]},
        ]
        session = await _create_translation_session(db, {
            "user_id": uid, "mode": "translation", "topic": "general",
        })
        sources = [i["source"] for i in session["exercises"]["exercises"]]
        assert "Slovenská veta 1." in llm["prompts"][0]
        assert "Slovenská veta 1." not in sources
        assert len(sources) == 10

    async def test_review_words_only_on_request(self, db, llm):
        uid = await _user(db)
        await upsert_vocab_progress(db, uid, [
            {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
        ])
        llm["responses"] = [
            {"exercises": [_translate(i) for i in range(10)]},
            {"exercises": [_translate(i) for i in range(20, 30)]},
        ]
        await _create_translation_session(db, {
            "user_id": uid, "mode": "translation", "topic": "general",
        })
        assert "hrad" not in llm["prompts"][0]
        await _create_translation_session(db, {
            "user_id": uid, "mode": "translation", "topic": "general", "include_review": True,
        })
        assert "Weave these review words" in llm["prompts"][1]
        assert "hrad" in llm["prompts"][1]

    async def test_focus_leads_and_word_lists_are_left_out(self, db, llm):
        uid = await _user(db)
        await upsert_vocab_progress(db, uid, [
            {"slovak": "kniha", "english": "book", "correct": True, "source_mode": "vocabulary"},
        ])
        llm["responses"] = [{"exercises": [_translate(i) for i in range(10)]}]
        await _create_translation_session(db, {
            "user_id": uid, "mode": "translation", "topic": "english_to_slovak",
            "instructions": "sentences about food",
        })
        prompt = llm["prompts"][0]
        assert prompt.index("sentences about food") < prompt.index("Generate 10")
        assert "[Student's vocabulary progress]" not in prompt
        assert "Topic:" not in prompt  # the chip chooses the exercise kind, not a theme

    async def test_schema_and_effort(self, db, llm):
        uid = await _user(db)
        llm["responses"] = [{"exercises": [_translate(i) for i in range(10)]}]
        await _create_translation_session(db, {
            "user_id": uid, "mode": "translation", "topic": "general",
        })
        assert llm["kwargs"][0]["schema"] is TRANSLATION_BATCH_SCHEMA
        assert llm["kwargs"][0]["effort"] == "medium"
        assert llm["kwargs"][0]["max_tokens"] == 16000

    async def test_too_few_items_after_retry_raises(self, db, llm):
        uid = await _user(db)
        llm["responses"] = [
            {"exercises": [_translate(i) for i in range(3)]},
            {"exercises": []},
        ]
        with pytest.raises(LLMError):
            await _create_translation_session(db, {
                "user_id": uid, "mode": "translation", "topic": "general",
            })
        assert len(llm["prompts"]) == 2


class TestGrading:
    async def test_accent_free_match_scores_10_without_the_model(self, db, llm):
        uid = await _user(db)
        sid = await _stored(db, uid, [
            {"source": "Yes, I have water.", "direction": "en-sk", "translation": None,
             "modelAnswer": "Áno, mám vodu.", "keyPoints": []},
        ])
        result = await submit_translation(db, sid, "Ano, mam  vodu")
        answer = result["exercises"]["answers"][0]
        assert answer["score"] == 10
        assert answer["tier"] == "accent"
        assert "Áno, mám vodu." in answer["feedback"]
        assert llm["prompts"] == []

    async def test_exact_match_has_no_accent_note(self, db, llm):
        uid = await _user(db)
        sid = await _stored(db, uid, [
            {"source": "Mám psa.", "direction": "sk-en", "translation": None,
             "modelAnswer": "I have a dog.", "keyPoints": []},
        ])
        result = await submit_translation(db, sid, "i have a dog")
        answer = result["exercises"]["answers"][0]
        assert answer["score"] == 10
        assert answer["tier"] == "exact"
        assert "accents" not in answer["feedback"]

    async def test_other_answers_go_to_the_grader(self, db, llm):
        uid = await _user(db)
        sid = await _stored(db, uid, [
            {"source": "Thank you for the bread.", "direction": "en-sk", "translation": None,
             "modelAnswer": "Ďakujem za chlieb.", "keyPoints": []},
        ])
        llm["responses"] = [{"score": 6, "feedback": "Close."}]
        result = await submit_translation(db, sid, "Dakujem pre chlieb")
        answer = result["exercises"]["answers"][0]
        assert answer == {"userAnswer": "Dakujem pre chlieb", "score": 6,
                          "feedback": "Close.", "tier": None}
        assert llm["kwargs"][0]["schema"] is TRANSLATION_GRADE_SCHEMA
        assert llm["kwargs"][0]["effort"] == "low"
        assert llm["kwargs"][0]["max_tokens"] == 4000

    async def test_grader_score_is_clamped_to_1_through_10(self, db, llm):
        uid = await _user(db)
        sid = await _stored(db, uid, [_translate(1), _translate(2)])
        llm["responses"] = [{"score": 14, "feedback": "x"}, {"score": 0, "feedback": "y"}]
        first = await submit_translation(db, sid, "something else")
        second = await submit_translation(db, sid, "something else again")
        assert first["exercises"]["answers"][0]["score"] == 10
        assert second["exercises"]["answers"][1]["score"] == 1

    async def test_unchanged_error_sentence_scores_1_without_the_model(self, db, llm):
        uid = await _user(db)
        sid = await _stored(db, uid, [
            {"source": "Mám voda.", "direction": "en-sk", "translation": "I have water.",
             "modelAnswer": "Mám vodu.", "keyPoints": ["accusative"]},
        ], kind="error_correction")
        result = await submit_translation(db, sid, "mam voda")
        answer = result["exercises"]["answers"][0]
        assert answer["score"] == 1
        assert "unchanged" in answer["feedback"]
        assert llm["prompts"] == []

    async def test_fill_blank_other_word_is_judged_in_context(self, db, llm):
        uid = await _user(db)
        sid = await _stored(db, uid, [
            {"source": "Mám ____.", "direction": "en-sk", "translation": "I have water.",
             "modelAnswer": "vodu", "keyPoints": []},
        ], kind="fill_blank")
        llm["responses"] = [{"score": 3, "feedback": "That means milk."}]
        await submit_translation(db, sid, "mlieko")
        assert "filled the blank" in llm["prompts"][0]
        assert "Mám ____." in llm["prompts"][0]

    async def test_items_stored_without_a_kind_still_grade(self, db, llm):
        uid = await _user(db)
        sid = f"tr-{uuid.uuid4().hex[:8]}"
        await db_create_session(db, {
            "id": sid, "user_id": uid, "mode": "translation", "topic": "general",
            "difficulty": "beginner", "completed": False,
            "created_at": "2026-08-01T10:00:00+00:00",
            "exercises": {
                "type": "translation",
                "exercises": [{"source": "I have water.", "direction": "en-sk",
                               "modelAnswer": "Mám vodu.", "keyPoints": []}],
                "currentIndex": 0, "answers": [None], "phase": "exercises",
            },
            "feedback": None, "messages": [],
        })
        result = await submit_translation(db, sid, "mam vodu")
        assert result["exercises"]["answers"][0]["score"] == 10

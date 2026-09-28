"""Vocab session creation: slot plan, exclusions, instructions, retry."""

from __future__ import annotations

import uuid

import pytest

from app import sessions as sessions_module
from app.database import upsert_vocab_progress
from app.llm import LLMError
from app.sessions import _create_vocab_session


pytestmark = pytest.mark.asyncio


def _q(word: str, correct: str | None = None) -> dict:
    # Unique correct answer per word — creation dedupes on the correct choice
    # too, so a shared placeholder would collapse every question into one.
    return {
        "word": word,
        "direction": "sk-en",
        "choices": [correct or f"{word}-en", f"{word}-b", f"{word}-c", f"{word}-d"],
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

    async def fake_ask_json(prompt, system_prompt=None, **kwargs):
        state["prompts"].append(prompt)
        state.setdefault("kwargs", []).append(kwargs)
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
    # LLM disobeys and returns the excluded word; it gets filtered out and a
    # top-up call replaces it
    llm["responses"] = [
        {"questions": [_q("kniha")] + [_q(f"s{i}") for i in range(9)]},
        {"questions": [_q("s9")]},
    ]
    session = await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    words = [q["word"] for q in session["exercises"]["questions"]]
    assert "kniha" not in words
    assert "kniha" in llm["prompts"][0]  # sent as an exclusion


async def test_due_words_ignored_by_default(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
    ])
    llm["responses"] = [{"questions": [_q(f"s{i}") for i in range(10)]}]
    session = await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "food_drink"})
    assert "REQUIRED REVIEW WORDS" not in llm["prompts"][0]
    assert all(q["review"] is False for q in session["exercises"]["questions"])
    # a due word is still a seen word, so it is excluded from the new slots
    assert "hrad" in llm["prompts"][0]


async def test_review_words_added_on_request(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
    ])
    llm["responses"] = [{"questions": [_q("hrad", "castle")] + [_q(f"s{i}") for i in range(9)]}]
    session = await _create_vocab_session(db, {
        "user_id": uid, "mode": "vocabulary", "topic": "food_drink", "include_review": True,
    })
    assert "REQUIRED REVIEW WORDS" in llm["prompts"][0]
    flags = {q["word"]: q["review"] for q in session["exercises"]["questions"]}
    assert flags["hrad"] is True
    assert flags["s0"] is False


async def test_only_quiz_words_are_review_candidates(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "knihu", "english": "", "correct": False, "source_mode": "grammar"},
        {"slovak": "vodu", "english": "water (accusative)", "correct": False, "source_mode": "translation"},
        {"slovak": "prázdny", "english": "", "correct": False, "source_mode": "vocabulary"},
    ])
    llm["responses"] = [{"questions": [_q(f"s{i}") for i in range(10)]}]
    await _create_vocab_session(db, {
        "user_id": uid, "mode": "vocabulary", "topic": "general", "include_review": True,
    })
    assert "REQUIRED REVIEW WORDS" not in llm["prompts"][0]


async def test_duplicate_review_question_kept_once(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
    ])
    llm["responses"] = [
        {"questions": [_q("hrad", "castle"), _q("hrad", "castle")] + [_q(f"s{i}") for i in range(8)]},
        {"questions": [_q("s8")]},
    ]
    session = await _create_vocab_session(db, {
        "user_id": uid, "mode": "vocabulary", "topic": "general", "include_review": True,
    })
    words = [q["word"] for q in session["exercises"]["questions"]]
    assert words.count("hrad") == 1
    assert len(words) == 10


async def test_missing_review_question_does_not_block_the_session(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
    ])
    llm["responses"] = [{"questions": [_q(f"s{i}") for i in range(10)]}]
    session = await _create_vocab_session(db, {
        "user_id": uid, "mode": "vocabulary", "topic": "general", "include_review": True,
    })
    assert len(session["exercises"]["questions"]) == 10


async def test_prompt_leads_with_focus_and_omits_word_lists(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "kniha", "english": "book", "correct": True, "source_mode": "vocabulary"},
    ])
    llm["responses"] = [{"questions": [_q(f"s{i}") for i in range(10)]}]
    await _create_vocab_session(db, {
        "user_id": uid, "mode": "vocabulary", "topic": "general",
        "instructions": "I want to learn about food",
    })
    prompt = llm["prompts"][0]
    assert prompt.index("I want to learn about food") < prompt.index("NEW vocabulary questions")
    assert "about: general" not in prompt
    assert "Topic: general" not in prompt
    assert "[Student's vocabulary progress]" not in prompt
    assert "Recently learned words" not in prompt


async def test_meta_answer_question_dropped_and_topped_up(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    bad = {
        "word": "na zdravie", "direction": "sk-en",
        "choices": ["cheers", "bless you", "all of the above", "to your health"],
        "correctIndex": 2, "explanation": "",
    }
    llm["responses"] = [
        {"questions": [bad] + [_q(f"s{i}") for i in range(9)]},
        {"questions": [_q("s9")]},
    ]
    session = await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    words = [q["word"] for q in session["exercises"]["questions"]]
    assert "na zdravie" not in words
    assert len(words) == 10


async def test_vocab_call_uses_schema_and_medium_effort(db, llm):
    from app.schemas import VOCAB_BATCH_SCHEMA

    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    llm["responses"] = [{"questions": [_q(f"s{i}") for i in range(10)]}]
    await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    assert llm["kwargs"][0]["schema"] is VOCAB_BATCH_SCHEMA
    assert llm["kwargs"][0]["effort"] == "medium"
    assert llm["kwargs"][0]["max_tokens"] == 16000


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


async def test_tops_up_when_one_question_dropped(db, llm):
    """9 valid questions should trigger a top-up retry so sessions deliver
    the promised 10 flashcards."""
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    llm["responses"] = [
        {"questions": [_q(f"s{i}") for i in range(9)]},
        {"questions": [_q("extra")]},
    ]
    session = await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    assert len(llm["prompts"]) == 2
    assert len(session["exercises"]["questions"]) == 10


async def test_no_retry_when_full_batch(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    llm["responses"] = [{"questions": [_q(f"s{i}") for i in range(10)]}]
    session = await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    assert len(llm["prompts"]) == 1
    assert len(session["exercises"]["questions"]) == 10


_DAYS = [
    ("pondelok", "Monday"), ("utorok", "Tuesday"), ("streda", "Wednesday"),
    ("stvrtok", "Thursday"), ("piatok", "Friday"), ("sobota", "Saturday"),
    ("nedela", "Sunday"),
]


async def test_used_up_focus_fills_with_seen_words_as_review(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": sk, "english": en, "correct": True, "source_mode": "vocabulary"}
        for sk, en in _DAYS
    ])
    reply = [_q(sk, en) for sk, en in _DAYS] + [_q(f"n{i}") for i in range(3)]
    llm["responses"] = [
        {"questions": [dict(q) for q in reply]},
        {"questions": [dict(q) for q in reply]},
    ]
    session = await _create_vocab_session(db, {
        "user_id": uid, "mode": "vocabulary", "topic": "general",
        "instructions": "the seven days of the week",
    })
    questions = session["exercises"]["questions"]
    assert len(questions) == 10
    flags = {q["word"]: q["review"] for q in questions}
    assert all(flags[f"n{i}"] is False for i in range(3))
    assert all(flags[sk] is True for sk, _ in _DAYS)


async def test_seen_words_from_first_reply_fill_before_top_up_reply(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": sk, "english": en, "correct": True, "source_mode": "vocabulary"}
        for sk, en in _DAYS
    ])
    first = [_q(sk, en) for sk, en in _DAYS[:4]] + [_q(f"n{i}") for i in range(4)]
    second = [_q(sk, en) for sk, en in _DAYS[4:]] + [_q(f"m{i}") for i in range(1)]
    llm["responses"] = [{"questions": first}, {"questions": second}]
    session = await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    words = [q["word"] for q in session["exercises"]["questions"]]
    assert words[:5] == ["n0", "n1", "n2", "n3", "m0"]
    assert words[5:] == [sk for sk, _ in _DAYS[:5]]


async def test_no_seen_word_added_when_new_words_suffice(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": sk, "english": en, "correct": True, "source_mode": "vocabulary"}
        for sk, en in _DAYS
    ])
    llm["responses"] = [
        {"questions": [_q(sk, en) for sk, en in _DAYS] + [_q(f"n{i}") for i in range(3)]},
        {"questions": [_q(f"m{i}") for i in range(7)]},
    ]
    session = await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    words = [q["word"] for q in session["exercises"]["questions"]]
    assert len(words) == 10
    assert not set(words) & {sk for sk, _ in _DAYS}
    assert all(q["review"] is False for q in session["exercises"]["questions"])


async def test_too_few_questions_of_any_kind_still_raises(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": sk, "english": en, "correct": True, "source_mode": "vocabulary"}
        for sk, en in _DAYS[:2]
    ])
    reply = [_q(sk, en) for sk, en in _DAYS[:2]] + [_q(f"n{i}") for i in range(3)]
    llm["responses"] = [
        {"questions": [dict(q) for q in reply]},
        {"questions": [dict(q) for q in reply]},
    ]
    with pytest.raises(LLMError):
        await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})


async def test_top_up_asks_again_for_a_skipped_review_word(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
    ])
    llm["responses"] = [
        {"questions": [_q(f"s{i}") for i in range(9)]},
        {"questions": [_q("hrad", "castle")]},
    ]
    session = await _create_vocab_session(db, {
        "user_id": uid, "mode": "vocabulary", "topic": "general", "include_review": True,
    })
    top_up = llm["prompts"][1]
    assert "REQUIRED REVIEW WORDS" in top_up
    assert "hrad (castle)" in top_up
    assert "Generate exactly 1 " in top_up
    flags = {q["word"]: q["review"] for q in session["exercises"]["questions"]}
    assert flags["hrad"] is True


async def test_top_up_names_no_review_word_already_covered(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
    ])
    llm["responses"] = [
        {"questions": [_q("hrad", "castle")] + [_q(f"s{i}") for i in range(8)]},
        {"questions": [_q("s8")]},
    ]
    await _create_vocab_session(db, {
        "user_id": uid, "mode": "vocabulary", "topic": "general", "include_review": True,
    })
    assert "REQUIRED REVIEW WORDS" not in llm["prompts"][1]

"""Live smoke test: build real lessons with the configured model.

Costs a few cents per run. Works on a throwaway database, so no learner data
is touched. Run from backend/:

    .venv/bin/python -m scripts.smoke_lessons
"""

from __future__ import annotations

import asyncio
import os
import statistics
import sys
import tempfile
import time

import aiosqlite

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["SLOVAK_DB_PATH"] = _tmp.name

from app.config import settings  # noqa: E402
from app.database import get_db, init_db  # noqa: E402
from app.scoring import strip_accents  # noqa: E402
from app.sessions import (  # noqa: E402
    TRANSLATION_KINDS,
    create_session,
    submit_translation,
    submit_vocab_answer,
)
from app.vocab_extraction import question_pair  # noqa: E402

USER = "smoke"
failures: list[str] = []
latencies: list[float] = []


def check(ok: bool, message: str) -> None:
    print(f"  {'ok  ' if ok else 'FAIL'} {message}")
    if not ok:
        failures.append(message)


async def timed_create(db: aiosqlite.Connection, req: dict) -> dict:
    started = time.monotonic()
    session = await create_session(db, {"user_id": USER, "difficulty": "beginner", **req})
    elapsed = time.monotonic() - started
    latencies.append(elapsed)
    print(f"  created in {elapsed:.1f}s")
    return session


async def vocab_round(db: aiosqlite.Connection, label: str, req: dict) -> set[str]:
    print(f"\n[vocabulary] {label}")
    session = await timed_create(db, {"mode": "vocabulary", **req})
    questions = session["exercises"]["questions"]
    pairs = [question_pair(q) for q in questions]
    for slovak, english in pairs:
        print(f"    {slovak} = {english}")
    check(len(questions) == 10, f"10 questions (got {len(questions)})")
    check(not any(q["review"] for q in questions), "no review words without asking")
    for q in questions:  # answer everything so the words count as seen
        await submit_vocab_answer(db, session["id"], q["correctIndex"])
    return {slovak.lower() for slovak, _ in pairs}


async def translation_round(db: aiosqlite.Connection, topic: str) -> dict:
    print(f"\n[translation] topic={topic}")
    session = await timed_create(db, {"mode": "translation", "topic": topic})
    items = session["exercises"]["exercises"]
    for item in items:
        print(f"    [{item['kind']} {item['direction']}] {item['source']}  ->  {item['modelAnswer']}")
    kind, direction = TRANSLATION_KINDS.get(topic, ("translate", None))
    check(len(items) == 10, f"10 exercises (got {len(items)})")
    check(all(i["kind"] == kind for i in items), f"every exercise is {kind}")
    if direction:
        check(all(i["direction"] == direction for i in items), f"every exercise is {direction}")
    return session


async def main() -> int:
    print(f"provider={settings.llm_provider} model={settings.openrouter_model}")
    await init_db()
    async with get_db() as db:
        await db.execute(
            "INSERT OR IGNORE INTO users (id, name, avatar, color) VALUES (?, 'Smoke', 'S', '#000')",
            (USER,),
        )
        await db.commit()

        # Typed request is honored, and words do not repeat across sessions.
        food = {"topic": "general", "instructions": "I want to learn about food"}
        first = await vocab_round(db, "typed request: food (1 of 3)", food)
        second = await vocab_round(db, "typed request: food (2 of 3)", food)
        third = await vocab_round(db, "typed request: food (3 of 3)", food)
        repeats = (first & second) | (first & third) | (second & third)
        check(not repeats, f"no word repeats across three sessions (repeats: {sorted(repeats)})")
        print("  READ: are all thirty words above about food?")

        # Topic chip is honored.
        await vocab_round(db, "topic chip: Numbers & Time", {"topic": "numbers_time"})
        print("  READ: are all ten words above numbers or time words?")

        # Translation kinds and directions.
        sessions = {t: await translation_round(db, t) for t in [*TRANSLATION_KINDS, "general"]}

        # Accent-free answers score 10 without the model; others reach the grader.
        print("\n[grading]")
        en_sk = sessions["english_to_slovak"]
        plain = strip_accents(en_sk["exercises"]["exercises"][0]["modelAnswer"]).lower()
        graded = await submit_translation(db, en_sk["id"], plain)
        answer = graded["exercises"]["answers"][0]
        print(f"    typed {plain!r} -> {answer['score']}/10, {answer['feedback']!r}")
        check(answer["score"] == 10, "accent-free answer scores 10")

        started = time.monotonic()
        graded = await submit_translation(db, en_sk["id"], "toto je zle")
        elapsed = time.monotonic() - started
        answer = graded["exercises"]["answers"][1]
        print(f"    wrong answer -> {answer['score']}/10 in {elapsed:.1f}s, {answer['feedback']!r}")
        check(1 <= answer["score"] <= 10, "grader returns a score from 1 to 10")
        check("diacritic" not in answer["feedback"].lower(), "grader does not mention diacritics")

        # Grammar and conversation start.
        print("\n[grammar] topic=noun_cases")
        grammar = await timed_create(db, {"mode": "grammar", "topic": "noun_cases"})
        lesson = grammar["exercises"]
        print(f"    concept: {lesson['lesson']['concept']}; {len(lesson['exercises'])} exercises")
        check(8 <= len(lesson["exercises"]) <= 10, "8 to 10 grammar exercises")
        check(
            all(e["sentence"].count("____") == 1 for e in lesson["exercises"]),
            "each grammar sentence has one blank",
        )

        print("\n[conversation] topic=shopping")
        chat = await timed_create(db, {"mode": "conversation", "topic": "shopping"})
        print(f"    tutor: {chat['messages'][0]['content']}")

    median = statistics.median(latencies)
    print(f"\nsession start latency: median {median:.1f}s, max {max(latencies):.1f}s")
    check(median < 20, f"median start under 20s (got {median:.1f}s)")

    print(f"\n{len(failures)} failed check(s)")
    for message in failures:
        print(f"  - {message}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

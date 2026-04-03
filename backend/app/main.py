"""FastAPI app for Slovak language learning."""

import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import (
    get_db,
    get_dashboard_stats,
    get_leaderboard,
    get_users,
    get_user_preferences,
    get_vocab_progress,
    get_vocab_stats,
    get_weak_words,
    init_db,
    list_sessions,
    update_user_preferences,
    delete_session as db_delete_session,
    get_session as db_get_session,
)
from .models import (
    AnswerRequest,
    CreateSessionRequest,
    GrammarAnswerRequest,
    TranslationAnswerRequest,
    UpdatePreferencesRequest,
    VocabAnswerRequest,
)
from .questions import QUESTIONS, TOPICS
from .sessions import (
    advance_grammar_phase,
    create_session,
    end_session,
    get_hint,
    submit_conversation_answer,
    submit_grammar_answer,
    submit_translation,
    submit_vocab_answer,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Slovak Learning API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ───────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── Users ────────────────────────────────────────────────────────────

@app.get("/api/users")
async def users():
    async with get_db() as db:
        return await get_users(db)


@app.get("/api/users/{user_id}/preferences")
async def get_preferences(user_id: str):
    async with get_db() as db:
        return await get_user_preferences(db, user_id)


@app.put("/api/users/{user_id}/preferences")
async def update_preferences(user_id: str, req: UpdatePreferencesRequest):
    async with get_db() as db:
        await update_user_preferences(db, user_id, req.custom_focus_areas)
        return await get_user_preferences(db, user_id)


@app.get("/api/users/{user_id}/vocabulary")
async def get_vocabulary(user_id: str):
    async with get_db() as db:
        all_vocab = await get_vocab_progress(db, user_id)
        stats = await get_vocab_stats(db, user_id)
        weak = await get_weak_words(db, user_id, limit=10)
        return {
            "words": all_vocab,
            "stats": stats,
            "weak_words": weak,
        }


# ── Modes & Topics ───────────────────────────────────────────────────

@app.get("/api/modes")
async def get_modes():
    return [
        {
            "id": "vocabulary",
            "label": "Vocabulary",
            "description": "Learn Slovak words and phrases through interactive quizzes.",
            "question_count": sum(len(q) for q in QUESTIONS.get("vocabulary", {}).values()),
        },
        {
            "id": "grammar",
            "label": "Grammar",
            "description": "Master Slovak grammar — cases, conjugations, and word order.",
            "question_count": sum(len(q) for q in QUESTIONS.get("grammar", {}).values()),
        },
        {
            "id": "conversation",
            "label": "Conversation",
            "description": "Practice real-world Slovak dialogues and role-plays.",
            "question_count": sum(len(q) for q in QUESTIONS.get("conversation", {}).values()),
        },
        {
            "id": "translation",
            "label": "Translation",
            "description": "Sharpen your skills translating between English and Slovak.",
            "question_count": sum(len(q) for q in QUESTIONS.get("translation", {}).values()),
        },
    ]


@app.get("/api/topics/{mode}")
async def get_topics(mode: str):
    topics = TOPICS.get(mode, {})
    if not topics:
        raise HTTPException(404, "Mode not found")
    return [{"id": k, "label": v} for k, v in topics.items()]


# ── Sessions ─────────────────────────────────────────────────────────

@app.post("/api/sessions")
async def create(req: CreateSessionRequest):
    async with get_db() as db:
        session = await create_session(db, {
            "user_id": req.user_id,
            "mode": req.mode.value,
            "topic": req.topic,
            "difficulty": req.difficulty.value,
        })
        return session


@app.get("/api/sessions")
async def list_all(user_id: Optional[str] = Query(None)):
    async with get_db() as db:
        sessions = await list_sessions(db, user_id)
        # Return summaries
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


@app.get("/api/sessions/{session_id}")
async def get_one(session_id: str):
    async with get_db() as db:
        session = await db_get_session(db, session_id)
        if not session:
            raise HTTPException(404, "Session not found")
        return session


@app.delete("/api/sessions/{session_id}")
async def remove(session_id: str):
    async with get_db() as db:
        if await db_delete_session(db, session_id):
            return {"ok": True}
        raise HTTPException(404, "Session not found")


# ── Mode-specific answer endpoints ───────────────────────────────────

@app.post("/api/sessions/{session_id}/vocab")
async def vocab_answer(session_id: str, req: VocabAnswerRequest):
    async with get_db() as db:
        try:
            return await submit_vocab_answer(db, session_id, req.choiceIndex)
        except ValueError as e:
            raise HTTPException(404, str(e))


@app.post("/api/sessions/{session_id}/grammar/advance")
async def grammar_advance(session_id: str):
    async with get_db() as db:
        try:
            return await advance_grammar_phase(db, session_id)
        except ValueError as e:
            raise HTTPException(404, str(e))


@app.post("/api/sessions/{session_id}/grammar")
async def grammar_answer(session_id: str, req: GrammarAnswerRequest):
    async with get_db() as db:
        try:
            return await submit_grammar_answer(db, session_id, req.answer)
        except ValueError as e:
            raise HTTPException(404, str(e))


@app.post("/api/sessions/{session_id}/translation")
async def translation_answer(session_id: str, req: TranslationAnswerRequest):
    async with get_db() as db:
        try:
            return await submit_translation(db, session_id, req.answer)
        except ValueError as e:
            raise HTTPException(404, str(e))


@app.post("/api/sessions/{session_id}/answer")
async def conversation_answer(session_id: str, req: AnswerRequest):
    async with get_db() as db:
        try:
            return await submit_conversation_answer(db, session_id, req.answer)
        except ValueError as e:
            raise HTTPException(404, str(e))


@app.post("/api/sessions/{session_id}/hint")
async def hint(session_id: str):
    async with get_db() as db:
        try:
            return await get_hint(db, session_id)
        except ValueError as e:
            raise HTTPException(404, str(e))


@app.post("/api/sessions/{session_id}/end")
async def end(session_id: str):
    async with get_db() as db:
        try:
            return await end_session(db, session_id)
        except ValueError as e:
            raise HTTPException(404, str(e))


# ── Dashboard & Leaderboard ─────────────────────────────────────────

@app.get("/api/dashboard")
async def dashboard(user_id: Optional[str] = Query(None)):
    async with get_db() as db:
        stats = await get_dashboard_stats(db, user_id)
        if user_id:
            vocab_stats_data = await get_vocab_stats(db, user_id)
            weak = await get_weak_words(db, user_id, limit=5)
            recent = (await get_vocab_progress(db, user_id))[:10]
            stats["vocab_stats"] = {
                **vocab_stats_data,
                "weak_words": weak,
                "recent_words": recent,
            }
        return stats


@app.get("/api/leaderboard")
async def leaderboard():
    async with get_db() as db:
        return await get_leaderboard(db)

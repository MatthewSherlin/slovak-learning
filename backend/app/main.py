"""FastAPI app for Slovak language learning."""

import logging
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .models import AnswerRequest, CreateSessionRequest
from .questions import QUESTIONS, TOPICS
from .sessions import (
    create_session,
    delete_session,
    end_session,
    get_dashboard_stats,
    get_hint,
    get_leaderboard,
    get_session,
    list_sessions,
    submit_answer,
)
from .users import get_users

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

app = FastAPI(title="Slovak Learning API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Users ────────────────────────

@app.get("/api/users")
async def users():
    return get_users()


# ── Leaderboard ──────────────────

@app.get("/api/leaderboard")
async def leaderboard():
    return [e.model_dump() for e in get_leaderboard()]


# ── Health ───────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── Modes & Topics ───────────────

@app.get("/api/modes")
async def get_modes():
    return [
        {
            "id": "vocabulary",
            "label": "Vocabulary",
            "description": "Learn Slovak words and phrases through interactive lessons.",
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


# ── Sessions ─────────────────────

@app.post("/api/sessions")
async def create(req: CreateSessionRequest):
    session = await create_session(req)
    return session.model_dump()


@app.get("/api/sessions")
async def list_all(user_id: Optional[str] = Query(None)):
    return [s.model_dump() for s in list_sessions(user_id)]


@app.get("/api/sessions/{session_id}")
async def get_one(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return session.model_dump()


@app.post("/api/sessions/{session_id}/answer")
async def answer(session_id: str, req: AnswerRequest):
    try:
        session = await submit_answer(session_id, req)
        return session.model_dump()
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.post("/api/sessions/{session_id}/hint")
async def hint(session_id: str):
    try:
        session = await get_hint(session_id)
        return session.model_dump()
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.post("/api/sessions/{session_id}/end")
async def end(session_id: str):
    try:
        feedback = await end_session(session_id)
        return feedback.model_dump()
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.delete("/api/sessions/{session_id}")
async def remove(session_id: str):
    if delete_session(session_id):
        return {"ok": True}
    raise HTTPException(404, "Session not found")


# ── Dashboard ────────────────────

@app.get("/api/dashboard")
async def dashboard(user_id: Optional[str] = Query(None)):
    return get_dashboard_stats(user_id).model_dump()

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
    set_user_pin,
    verify_user_pin,
    remove_user_pin,
    user_has_pin,
    get_user_farm,
    purchase_farm_item,
    move_farm_item,
    remove_farm_item,
    get_user_cards,
    purchase_pack,
    get_all_users_card_counts,
    _get_user_xp_earned,
    _get_user_xp_spent,
)
from .cards import CARDS, CARD_BY_ID, SETS, CARDS_BY_SET
from .models import (
    AnswerRequest,
    CreateSessionRequest,
    FarmMoveRequest,
    FarmPurchaseRequest,
    GrammarAnswerRequest,
    PackPurchaseRequest,
    PinRequest,
    PinVerifyResponse,
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


# ── User PIN ─────────────────────────────────────────────────────────

@app.post("/api/users/{user_id}/pin")
async def set_pin(user_id: str, req: PinRequest):
    if not req.pin.isdigit() or len(req.pin) != 4:
        raise HTTPException(400, "PIN must be exactly 4 digits")
    async with get_db() as db:
        if not await set_user_pin(db, user_id, req.pin):
            raise HTTPException(404, "User not found")
        return {"ok": True}


@app.post("/api/users/{user_id}/verify-pin")
async def verify_pin(user_id: str, req: PinRequest):
    async with get_db() as db:
        valid = await verify_user_pin(db, user_id, req.pin)
        return PinVerifyResponse(valid=valid)


@app.delete("/api/users/{user_id}/pin")
async def delete_pin(user_id: str, req: PinRequest):
    async with get_db() as db:
        if not await verify_user_pin(db, user_id, req.pin):
            raise HTTPException(403, "Invalid PIN")
        if not await remove_user_pin(db, user_id):
            raise HTTPException(404, "User not found")
        return {"ok": True}


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
            "focus_areas": req.focus_areas,
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


# ── XP Orchard (Farm) ───────────────────────────────────────────────

@app.get("/api/users/{user_id}/farm")
async def farm_state(user_id: str):
    async with get_db() as db:
        return await get_user_farm(db, user_id)


@app.post("/api/users/{user_id}/farm/purchase")
async def farm_purchase(user_id: str, req: FarmPurchaseRequest):
    async with get_db() as db:
        item = await purchase_farm_item(db, user_id, req.item_type, req.grid_x, req.grid_y)
        if not item:
            raise HTTPException(400, "Purchase failed: invalid item, insufficient XP, or position occupied")
        return item


@app.put("/api/users/{user_id}/farm/move")
async def farm_move(user_id: str, req: FarmMoveRequest):
    async with get_db() as db:
        if not await move_farm_item(db, user_id, req.item_id, req.grid_x, req.grid_y):
            raise HTTPException(400, "Move failed: invalid position, position occupied, or item not found")
        return {"ok": True}


@app.delete("/api/users/{user_id}/farm/{item_id}")
async def farm_remove(user_id: str, item_id: int):
    async with get_db() as db:
        if not await remove_farm_item(db, user_id, item_id):
            raise HTTPException(404, "Farm item not found")
        return {"ok": True}


# ── Card Collection ────────────────────────────────────────────────

@app.get("/api/cards/catalog")
async def card_catalog():
    """Return all sets and their card counts."""
    result = []
    for set_id, info in SETS.items():
        cards = CARDS_BY_SET.get(set_id, [])
        result.append({
            "set_id": set_id,
            "name": info["name"],
            "emoji": info["emoji"],
            "description": info["description"],
            "cost": info["cost"],
            "total_cards": len(cards),
        })
    return result


@app.get("/api/cards/all")
async def all_cards():
    """Return full card catalog data."""
    return {"cards": CARDS, "sets": SETS}


@app.get("/api/users/{user_id}/cards")
async def user_cards(user_id: str):
    """Get a user's card collection with full card data."""
    async with get_db() as db:
        card_ids = await get_user_cards(db, user_id)
        cards = [CARD_BY_ID[cid] for cid in card_ids if cid in CARD_BY_ID]

        # Calculate XP
        xp_earned = await _get_user_xp_earned(db, user_id)
        xp_spent = await _get_user_xp_spent(db, user_id)

        return {
            "cards": cards,
            "total_unique": len(set(card_ids)),
            "total_possible": len(CARDS),
            "xp_earned": xp_earned,
            "xp_spent": xp_spent,
            "xp_available": xp_earned - xp_spent,
        }


@app.post("/api/users/{user_id}/cards/purchase")
async def purchase_card_pack(user_id: str, req: PackPurchaseRequest):
    """Purchase a card pack with XP."""
    async with get_db() as db:
        result = await purchase_pack(db, user_id, req.set_id)
        if not result:
            raise HTTPException(400, "Purchase failed: invalid set or insufficient XP")
        return result


@app.get("/api/cards/social")
async def cards_social():
    """Get card collection stats for all users (for social comparison)."""
    async with get_db() as db:
        users_list = await get_users(db)
        counts = await get_all_users_card_counts(db)

        result = []
        for user in users_list:
            uid = user["id"]
            card_ids = await get_user_cards(db, uid)
            # Group by set
            set_counts = {}
            for cid in card_ids:
                card = CARD_BY_ID.get(cid)
                if card:
                    sid = card["set_id"]
                    set_counts[sid] = set_counts.get(sid, 0) + 1

            result.append({
                "user_id": uid,
                "name": user["name"],
                "avatar": user["avatar"],
                "color": user["color"],
                "total_cards": counts.get(uid, 0),
                "sets_progress": set_counts,
            })

        return result

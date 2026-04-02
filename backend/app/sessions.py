"""Session management with JSON persistence."""

from __future__ import annotations

import json
import logging
import random
import uuid
from datetime import datetime, timezone, timedelta

from .llm import ask, ask_json
from .config import settings
from .models import (
    AnswerRequest,
    CreateSessionRequest,
    DashboardStats,
    Difficulty,
    LeaderboardEntry,
    Message,
    PracticeMode,
    Session,
    SessionFeedback,
    SessionSummary,
)
from .prompts import (
    CONVERSATION_PROMPT,
    FEEDBACK_PROMPT,
    FOLLOW_UP_PROMPT,
    GRAMMAR_PROMPT,
    HINT_PROMPT,
    TRANSLATION_PROMPT,
    VOCABULARY_PROMPT,
)
from .questions import QUESTIONS, TOPICS
from .users import get_user, get_users

log = logging.getLogger(__name__)

_sessions: dict[str, Session] = {}
_DATA_FILE = settings.data_dir / "sessions.json"

MODE_PROMPTS = {
    PracticeMode.vocabulary: VOCABULARY_PROMPT,
    PracticeMode.grammar: GRAMMAR_PROMPT,
    PracticeMode.conversation: CONVERSATION_PROMPT,
    PracticeMode.translation: TRANSLATION_PROMPT,
}


def _save() -> None:
    data = {sid: s.model_dump() for sid, s in _sessions.items()}
    _DATA_FILE.write_text(json.dumps(data, default=str, indent=2))


def _load() -> None:
    global _sessions
    if _DATA_FILE.exists():
        try:
            raw = json.loads(_DATA_FILE.read_text())
            _sessions = {sid: Session(**d) for sid, d in raw.items()}
            log.info("Loaded %d sessions from disk", len(_sessions))
        except Exception as e:
            log.warning("Failed to load sessions: %s", e)
            _sessions = {}


_load()


def _build_conversation(session: Session) -> str:
    lines = []
    for msg in session.messages:
        label = "Tutor" if msg.role == "tutor" else "Student" if msg.role == "student" else "System"
        lines.append(f"{label}: {msg.content}")
    return "\n".join(lines)


async def create_session(req: CreateSessionRequest) -> Session:
    mode_questions = QUESTIONS.get(req.mode.value, {})
    topic_questions = mode_questions.get(req.topic, [])

    if topic_questions:
        question = random.choice(topic_questions)
    else:
        question = f"Let's practice {req.mode.value} focusing on {req.topic.replace('_', ' ')}."

    system_prompt = MODE_PROMPTS[req.mode]
    difficulty_label = {
        Difficulty.beginner: "beginner (A1-A2)",
        Difficulty.intermediate: "intermediate (B1-B2)",
        Difficulty.advanced: "advanced (C1-C2)",
    }[req.difficulty]

    user = get_user(req.user_id)
    student_name = user["name"] if user else "Student"

    full_prompt = (
        f"The student's name is {student_name} and they are at {difficulty_label} level.\n"
        f"Topic: {TOPICS.get(req.mode.value, {}).get(req.topic, req.topic)}\n\n"
        f"Start the lesson with this focus: {question}\n\n"
        f"Begin the lesson now. Greet {student_name} warmly and start teaching."
    )

    response = await ask(full_prompt, system_prompt)

    session = Session(
        id=uuid.uuid4().hex[:12],
        user_id=req.user_id,
        mode=req.mode,
        topic=req.topic,
        difficulty=req.difficulty,
        messages=[Message(role="tutor", content=response)],
        completed=False,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    _sessions[session.id] = session
    _save()
    return session


async def submit_answer(session_id: str, req: AnswerRequest) -> Session:
    session = _sessions.get(session_id)
    if not session:
        raise ValueError("Session not found")
    if session.completed:
        raise ValueError("Session is completed")

    session.messages.append(Message(role="student", content=req.answer))

    conversation = _build_conversation(session)
    system_prompt = MODE_PROMPTS[session.mode]

    difficulty_label = {
        Difficulty.beginner: "beginner (A1-A2)",
        Difficulty.intermediate: "intermediate (B1-B2)",
        Difficulty.advanced: "advanced (C1-C2)",
    }[session.difficulty]

    prompt = (
        f"Student level: {difficulty_label}\n"
        f"Topic: {TOPICS.get(session.mode.value, {}).get(session.topic, session.topic)}\n\n"
        f"Conversation so far:\n{conversation}\n\n"
        f"Continue the lesson based on the student's last response. "
        f"Evaluate their answer, provide feedback, and continue teaching."
    )

    response = await ask(prompt, system_prompt)
    session.messages.append(Message(role="tutor", content=response))
    _save()
    return session


async def get_hint(session_id: str) -> Session:
    session = _sessions.get(session_id)
    if not session:
        raise ValueError("Session not found")

    conversation = _build_conversation(session)
    prompt = f"Conversation so far:\n{conversation}\n\nProvide a helpful hint for the student."

    response = await ask(prompt, HINT_PROMPT)
    session.messages.append(Message(role="system", content=f"💡 {response}"))
    _save()
    return session


async def end_session(session_id: str) -> SessionFeedback:
    session = _sessions.get(session_id)
    if not session:
        raise ValueError("Session not found")

    conversation = _build_conversation(session)
    mode_label = session.mode.value.replace("_", " ").title()
    topic_label = TOPICS.get(session.mode.value, {}).get(session.topic, session.topic)

    prompt = (
        f"Mode: {mode_label}\n"
        f"Topic: {topic_label}\n"
        f"Difficulty: {session.difficulty.value}\n\n"
        f"Full session transcript:\n{conversation}\n\n"
        f"Analyze this session and provide feedback as JSON."
    )

    data = await ask_json(prompt, FEEDBACK_PROMPT)

    feedback = SessionFeedback(
        overall_score=data.get("overall_score", 5),
        scores=[
            {"category": s["category"], "score": s["score"], "comment": s["comment"]}
            for s in data.get("scores", [])
        ],
        strengths=data.get("strengths", []),
        improvements=data.get("improvements", []),
        sample_answer=data.get("sample_answer"),
        vocabulary_learned=[
            {"slovak": v["slovak"], "english": v["english"], "example": v.get("example")}
            for v in data.get("vocabulary_learned", [])
        ],
        grammar_notes=data.get("grammar_notes", []),
    )

    session.completed = True
    session.feedback = feedback
    _save()
    return feedback


def get_session(session_id: str) -> Session | None:
    return _sessions.get(session_id)


def list_sessions(user_id: str | None = None) -> list[SessionSummary]:
    summaries = []
    sessions = sorted(_sessions.values(), key=lambda x: x.created_at, reverse=True)
    if user_id:
        sessions = [s for s in sessions if s.user_id == user_id]

    for s in sessions:
        first_msg = s.messages[0].content if s.messages else ""
        preview = first_msg[:120] + "..." if len(first_msg) > 120 else first_msg
        summaries.append(
            SessionSummary(
                id=s.id,
                user_id=s.user_id,
                mode=s.mode.value,
                topic=s.topic,
                difficulty=s.difficulty.value,
                completed=s.completed,
                overall_score=s.feedback.overall_score if s.feedback else None,
                question_preview=preview,
                created_at=s.created_at,
            )
        )
    return summaries


def delete_session(session_id: str) -> bool:
    if session_id in _sessions:
        del _sessions[session_id]
        _save()
        return True
    return False


def get_dashboard_stats(user_id: str | None = None) -> DashboardStats:
    sessions = list(_sessions.values())
    if user_id:
        sessions = [s for s in sessions if s.user_id == user_id]

    completed = [s for s in sessions if s.completed and s.feedback]
    scores = [s.feedback.overall_score for s in completed if s.feedback]

    scores_by_mode: dict[str, list[float]] = {}
    all_strengths: list[str] = []
    all_weaknesses: list[str] = []
    total_vocab = 0

    for s in completed:
        if s.feedback:
            mode = s.mode.value
            scores_by_mode.setdefault(mode, []).append(s.feedback.overall_score)
            all_strengths.extend(s.feedback.strengths[:2])
            all_weaknesses.extend(s.feedback.improvements[:2])
            total_vocab += len(s.feedback.vocabulary_learned)

    avg_by_mode = {m: sum(v) / len(v) for m, v in scores_by_mode.items()}

    recent = list_sessions(user_id)[:5]

    return DashboardStats(
        total_sessions=len(sessions),
        completed_sessions=len(completed),
        avg_score=sum(scores) / len(scores) if scores else None,
        scores_by_mode=avg_by_mode,
        strong_areas=list(dict.fromkeys(all_strengths))[:5],
        weak_areas=list(dict.fromkeys(all_weaknesses))[:5],
        recent_sessions=recent,
        vocab_count=total_vocab,
    )


def _calculate_xp(user_sessions: list[Session]) -> int:
    """XP system: 10 per completed session + score bonus + vocab bonus."""
    xp = 0
    for s in user_sessions:
        if s.completed and s.feedback:
            xp += 10  # base XP per completion
            xp += int(s.feedback.overall_score * 2)  # score bonus (up to 20)
            xp += len(s.feedback.vocabulary_learned) * 2  # vocab bonus
    return xp


def _calculate_streak(user_sessions: list[Session]) -> int:
    """Count consecutive days with at least one completed session."""
    if not user_sessions:
        return 0

    completed_dates = set()
    for s in user_sessions:
        if s.completed:
            try:
                dt = datetime.fromisoformat(s.created_at.replace("Z", "+00:00"))
                completed_dates.add(dt.date())
            except Exception:
                pass

    if not completed_dates:
        return 0

    today = datetime.now(timezone.utc).date()
    streak = 0
    current = today

    while current in completed_dates:
        streak += 1
        current -= timedelta(days=1)

    # Also count if they haven't done today yet but did yesterday
    if streak == 0 and (today - timedelta(days=1)) in completed_dates:
        current = today - timedelta(days=1)
        while current in completed_dates:
            streak += 1
            current -= timedelta(days=1)

    return streak


def get_leaderboard() -> list[LeaderboardEntry]:
    users = get_users()
    entries = []

    for user in users:
        uid = user["id"]
        user_sessions = [s for s in _sessions.values() if s.user_id == uid]
        completed = [s for s in user_sessions if s.completed and s.feedback]
        scores = [s.feedback.overall_score for s in completed if s.feedback]
        total_vocab = sum(
            len(s.feedback.vocabulary_learned) for s in completed if s.feedback
        )

        entries.append(
            LeaderboardEntry(
                user_id=uid,
                name=user["name"],
                avatar=user["avatar"],
                color=user["color"],
                total_sessions=len(user_sessions),
                completed_sessions=len(completed),
                avg_score=sum(scores) / len(scores) if scores else None,
                total_vocab=total_vocab,
                streak_days=_calculate_streak(user_sessions),
                xp=_calculate_xp(user_sessions),
            )
        )

    # Sort by XP descending
    entries.sort(key=lambda e: e.xp, reverse=True)
    return entries

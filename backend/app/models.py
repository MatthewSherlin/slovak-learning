from __future__ import annotations

from enum import Enum
from pydantic import BaseModel


class PracticeMode(str, Enum):
    vocabulary = "vocabulary"
    grammar = "grammar"
    conversation = "conversation"
    translation = "translation"


class Difficulty(str, Enum):
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"


class Message(BaseModel):
    role: str  # "tutor" | "student" | "system"
    content: str


class Session(BaseModel):
    id: str
    user_id: str
    mode: PracticeMode
    topic: str
    difficulty: Difficulty
    messages: list[Message]
    completed: bool
    created_at: str
    feedback: SessionFeedback | None = None


class FeedbackScore(BaseModel):
    category: str
    score: float
    comment: str


class SessionFeedback(BaseModel):
    overall_score: float
    scores: list[FeedbackScore]
    strengths: list[str]
    improvements: list[str]
    sample_answer: str | None = None
    vocabulary_learned: list[VocabEntry] = []
    grammar_notes: list[str] = []


class VocabEntry(BaseModel):
    slovak: str
    english: str
    example: str | None = None


class SessionSummary(BaseModel):
    id: str
    user_id: str
    mode: str
    topic: str
    difficulty: str
    completed: bool
    overall_score: float | None
    question_preview: str
    created_at: str


class DashboardStats(BaseModel):
    total_sessions: int
    completed_sessions: int
    avg_score: float | None
    scores_by_mode: dict[str, float]
    strong_areas: list[str]
    weak_areas: list[str]
    recent_sessions: list[SessionSummary]
    vocab_count: int


class CreateSessionRequest(BaseModel):
    user_id: str
    mode: PracticeMode
    topic: str
    difficulty: Difficulty = Difficulty.beginner


class LeaderboardEntry(BaseModel):
    user_id: str
    name: str
    avatar: str
    color: str
    total_sessions: int
    completed_sessions: int
    avg_score: float | None
    total_vocab: int
    streak_days: int
    xp: int


class AnswerRequest(BaseModel):
    answer: str

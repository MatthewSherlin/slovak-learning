from __future__ import annotations

from enum import Enum
from typing import Literal

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


# ── Feedback ─────────────────────────────────────────────────────────

class FeedbackScore(BaseModel):
    category: str
    score: float
    comment: str


class VocabEntry(BaseModel):
    slovak: str
    english: str
    example: str | None = None


class SessionFeedback(BaseModel):
    overall_score: float
    scores: list[FeedbackScore]
    strengths: list[str]
    improvements: list[str]
    sample_answer: str | None = None
    vocabulary_learned: list[VocabEntry] = []
    grammar_notes: list[str] = []


# ── Vocabulary exercise types ────────────────────────────────────────

class VocabQuestion(BaseModel):
    word: str
    direction: str  # "sk-en" | "en-sk"
    choices: list[str]
    correctIndex: int
    explanation: str


class VocabExerciseData(BaseModel):
    type: Literal["vocabulary"] = "vocabulary"
    questions: list[VocabQuestion]
    currentIndex: int = 0
    answers: list[int | None] = []
    retryQueue: list[int] = []
    phase: str = "questions"  # "questions" | "retry" | "complete"


# ── Grammar exercise types ───────────────────────────────────────────

class GrammarLesson(BaseModel):
    concept: str
    explanation: str
    examples: list[str]
    table: str | None = None


class GrammarExercise(BaseModel):
    sentence: str
    blank: str
    hint: str | None = None
    explanation: str


class GrammarExerciseData(BaseModel):
    type: Literal["grammar"] = "grammar"
    lesson: GrammarLesson
    exercises: list[GrammarExercise]
    currentIndex: int = 0
    answers: list[str | None] = []
    correct: list[bool | None] = []
    phase: str = "lesson"  # "lesson" | "exercises" | "complete"


# ── Translation exercise types ───────────────────────────────────────

class TranslationExerciseItem(BaseModel):
    source: str
    direction: str  # "sk-en" | "en-sk"
    modelAnswer: str
    keyPoints: list[str]


class TranslationAnswer(BaseModel):
    userAnswer: str
    score: float
    feedback: str


class TranslationExerciseData(BaseModel):
    type: Literal["translation"] = "translation"
    exercises: list[TranslationExerciseItem]
    currentIndex: int = 0
    answers: list[TranslationAnswer | None] = []
    phase: str = "exercises"  # "exercises" | "complete"


# ── Conversation exercise types ──────────────────────────────────────

class ConversationExerciseData(BaseModel):
    type: Literal["conversation"] = "conversation"
    exchangeCount: int = 0
    maxExchanges: int = 10
    phase: str = "active"  # "active" | "complete"


# ── Session ──────────────────────────────────────────────────────────

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
    exercises: VocabExerciseData | GrammarExerciseData | TranslationExerciseData | ConversationExerciseData | None = None


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


class VocabProgressEntry(BaseModel):
    slovak: str
    english: str
    times_seen: int
    times_correct: int
    last_seen_at: str
    source_mode: str


class VocabProgressStats(BaseModel):
    total_words: int
    mastered: int
    learning: int
    new_or_weak: int
    weak_words: list[VocabProgressEntry] = []
    recent_words: list[VocabProgressEntry] = []


class DashboardStats(BaseModel):
    total_sessions: int
    completed_sessions: int
    avg_score: float | None
    scores_by_mode: dict[str, float]
    strong_areas: list[str]
    weak_areas: list[str]
    recent_sessions: list[SessionSummary]
    vocab_count: int
    vocab_stats: VocabProgressStats | None = None


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


# ── Request models ───────────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    user_id: str
    mode: PracticeMode
    topic: str = "general"
    difficulty: Difficulty = Difficulty.beginner
    focus_areas: list[str] = []


class AnswerRequest(BaseModel):
    answer: str


class VocabAnswerRequest(BaseModel):
    choiceIndex: int


class GrammarAnswerRequest(BaseModel):
    answer: str


class TranslationAnswerRequest(BaseModel):
    answer: str


class UserPreferences(BaseModel):
    user_id: str
    custom_focus_areas: list[str] = []
    updated_at: str | None = None


class UpdatePreferencesRequest(BaseModel):
    custom_focus_areas: list[str]

export type LearningMode = 'vocabulary' | 'grammar' | 'conversation' | 'translation';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface User {
  id: string;
  name: string;
  avatar: string;
  color: string;
}

export interface Mode {
  id: LearningMode;
  label: string;
  description: string;
  question_count: number;
}

export interface Topic {
  id: string;
  label: string;
}

export interface Message {
  role: 'tutor' | 'student' | 'system';
  content: string;
}

export interface FeedbackScore {
  category: string;
  score: number;
  comment: string;
}

export interface VocabEntry {
  slovak: string;
  english: string;
  example: string | null;
}

export interface SessionFeedback {
  overall_score: number;
  scores: FeedbackScore[];
  strengths: string[];
  improvements: string[];
  sample_answer: string;
  vocabulary_learned: VocabEntry[];
  grammar_notes: string[];
}

// -- Vocabulary exercise types --
export interface VocabQuestion {
  word: string;
  direction: 'sk-en' | 'en-sk';
  choices: string[];
  correctIndex: number;
  explanation: string;
}

export interface VocabExerciseData {
  type: 'vocabulary';
  questions: VocabQuestion[];
  currentIndex: number;
  answers: (number | null)[];
  retryQueue: number[];
  phase: 'questions' | 'retry' | 'complete';
}

// -- Grammar exercise types --
export interface GrammarLesson {
  concept: string;
  explanation: string;
  examples: string[];
  table?: string;
}

export interface GrammarExercise {
  sentence: string;
  blank: string;
  hint?: string;
  explanation: string;
  choices?: string[];
}

export interface GrammarExerciseData {
  type: 'grammar';
  lesson: GrammarLesson;
  exercises: GrammarExercise[];
  currentIndex: number;
  answers: (string | null)[];
  correct: (boolean | null)[];
  phase: 'lesson' | 'exercises' | 'complete';
}

// -- Translation exercise types --
export interface TranslationExercise {
  source: string;
  direction: 'sk-en' | 'en-sk';
  modelAnswer: string;
  keyPoints: string[];
}

export interface TranslationAnswer {
  userAnswer: string;
  score: number;
  feedback: string;
}

export interface TranslationExerciseData {
  type: 'translation';
  exercises: TranslationExercise[];
  currentIndex: number;
  answers: (TranslationAnswer | null)[];
  phase: 'exercises' | 'complete';
}

// -- Conversation exercise types --
export interface ConversationExerciseData {
  type: 'conversation';
  exchangeCount: number;
  maxExchanges: number;
  phase: 'active' | 'complete';
  scenario?: string;
}

// -- Discriminated union --
export type ExerciseData =
  | VocabExerciseData
  | GrammarExerciseData
  | TranslationExerciseData
  | ConversationExerciseData;

export interface Session {
  id: string;
  user_id: string;
  mode: LearningMode;
  topic: string;
  difficulty: Difficulty;
  messages: Message[];
  completed: boolean;
  created_at: string;
  feedback: SessionFeedback | null;
  exercises?: ExerciseData;
  focus_areas?: string[];
}

export interface SessionSummary {
  id: string;
  user_id: string;
  mode: LearningMode;
  topic: string;
  difficulty: Difficulty;
  completed: boolean;
  overall_score: number | null;
  question_preview: string;
  created_at: string;
}

// -- Vocabulary progress types --
export interface VocabProgressEntry {
  slovak: string;
  english: string;
  times_seen: number;
  times_correct: number;
  last_seen_at: string;
  source_mode: string;
}

export interface VocabProgressStats {
  total_words: number;
  mastered: number;
  learning: number;
  new_or_weak: number;
  weak_words: VocabProgressEntry[];
  recent_words: VocabProgressEntry[];
}

// -- User preferences types --
export interface UserPreferences {
  user_id: string;
  custom_focus_areas: string[];
  updated_at: string | null;
}

export interface DashboardStats {
  total_sessions: number;
  completed_sessions: number;
  avg_score: number | null;
  scores_by_mode: Record<string, number>;
  strong_areas: string[];
  weak_areas: string[];
  recent_sessions: SessionSummary[];
  vocab_count: number;
  vocab_stats?: VocabProgressStats;
}

export interface LeaderboardEntry {
  user_id: string;
  name: string;
  avatar: string;
  color: string;
  total_sessions: number;
  completed_sessions: number;
  avg_score: number | null;
  total_vocab: number;
  streak_days: number;
  xp: number;
}

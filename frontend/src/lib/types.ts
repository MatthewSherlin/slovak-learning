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

export interface DashboardStats {
  total_sessions: number;
  completed_sessions: number;
  avg_score: number | null;
  scores_by_mode: Record<string, number>;
  strong_areas: string[];
  weak_areas: string[];
  recent_sessions: SessionSummary[];
  vocab_count: number;
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

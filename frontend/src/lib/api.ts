/**
 * API layer — HTTP client calling the FastAPI backend.
 */

import type {
  DashboardStats,
  Difficulty,
  LeaderboardEntry,
  LearningMode,
  Mode,
  Session,
  SessionFeedback,
  SessionSummary,
  Topic,
  User,
  UserPreferences,
  VocabProgressEntry,
  VocabProgressStats,
} from './types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8888';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `API error: ${res.status}`);
  }
  return res.json();
}

// ── Static data ─────────────────────────────────────────────────────

export const getUsers = (): Promise<User[]> =>
  apiFetch('/api/users');

export const getModes = (): Promise<Mode[]> =>
  apiFetch('/api/modes');

export const getTopics = (mode: string): Promise<Topic[]> =>
  apiFetch(`/api/topics/${mode}`);

// ── Sessions ────────────────────────────────────────────────────────

export const createSession = (data: {
  user_id: string;
  mode: LearningMode;
  topic?: string;
  difficulty: Difficulty;
  focus_areas?: string[];
}): Promise<Session> =>
  apiFetch('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getSession = (id: string): Promise<Session> =>
  apiFetch(`/api/sessions/${id}`);

export const listSessions = (userId?: string): Promise<SessionSummary[]> =>
  apiFetch(`/api/sessions${userId ? `?user_id=${userId}` : ''}`);

export const deleteSession = (sessionId: string): Promise<{ ok: boolean }> =>
  apiFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });

// ── Mode-specific answers ───────────────────────────────────────────

export const submitVocabAnswer = (sessionId: string, choiceIndex: number): Promise<Session> =>
  apiFetch(`/api/sessions/${sessionId}/vocab`, {
    method: 'POST',
    body: JSON.stringify({ choiceIndex }),
  });

export const advanceGrammarPhase = (sessionId: string): Promise<Session> =>
  apiFetch(`/api/sessions/${sessionId}/grammar/advance`, { method: 'POST' });

export const submitGrammarAnswer = (sessionId: string, answer: string): Promise<Session> =>
  apiFetch(`/api/sessions/${sessionId}/grammar`, {
    method: 'POST',
    body: JSON.stringify({ answer }),
  });

export const submitTranslation = (sessionId: string, answer: string): Promise<Session> =>
  apiFetch(`/api/sessions/${sessionId}/translation`, {
    method: 'POST',
    body: JSON.stringify({ answer }),
  });

export const submitAnswer = (sessionId: string, answer: string): Promise<Session> =>
  apiFetch(`/api/sessions/${sessionId}/answer`, {
    method: 'POST',
    body: JSON.stringify({ answer }),
  });

export const requestHint = (sessionId: string): Promise<Session> =>
  apiFetch(`/api/sessions/${sessionId}/hint`, { method: 'POST' });

export const endSession = (sessionId: string): Promise<SessionFeedback> =>
  apiFetch(`/api/sessions/${sessionId}/end`, { method: 'POST' });

// ── Dashboard & Leaderboard ─────────────────────────────────────────

export const getDashboard = (userId: string): Promise<DashboardStats> =>
  apiFetch(`/api/dashboard?user_id=${userId}`);

export const getLeaderboard = (): Promise<LeaderboardEntry[]> =>
  apiFetch('/api/leaderboard');

// ── User preferences ─────────────────────────────────────────────────

export const getUserPreferences = (userId: string): Promise<UserPreferences> =>
  apiFetch(`/api/users/${userId}/preferences`);

export const updateUserPreferences = (
  userId: string,
  data: { custom_focus_areas: string[] }
): Promise<UserPreferences> =>
  apiFetch(`/api/users/${userId}/preferences`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

// ── Vocabulary progress ──────────────────────────────────────────────

export const getVocabularyProgress = (
  userId: string
): Promise<{ words: VocabProgressEntry[]; stats: VocabProgressStats; weak_words: VocabProgressEntry[] }> =>
  apiFetch(`/api/users/${userId}/vocabulary`);

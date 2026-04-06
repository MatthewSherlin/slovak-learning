/**
 * API layer — HTTP client calling the FastAPI backend.
 */

import type {
  CardSocialEntry,
  CardSet,
  DashboardStats,
  Difficulty,
  FarmItem,
  FarmState,
  LeaderboardEntry,
  LearningMode,
  Mode,
  PackPurchaseResult,
  Session,
  SessionFeedback,
  SessionSummary,
  Topic,
  User,
  UserCardCollection,
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

// ── PIN management ──────────────────────────────────────────────────

export const setPin = (userId: string, pin: string): Promise<void> =>
  apiFetch(`/api/users/${userId}/pin`, {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });

export const verifyPin = async (userId: string, pin: string): Promise<boolean> => {
  const res = await apiFetch<{ valid: boolean }>(`/api/users/${userId}/verify-pin`, {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
  return res.valid;
};

export const removePin = (userId: string, pin: string): Promise<void> =>
  apiFetch(`/api/users/${userId}/pin`, {
    method: 'DELETE',
    body: JSON.stringify({ pin }),
  });

// ── Vocabulary progress ──────────────────────────────────────────────

export const getVocabularyProgress = (
  userId: string
): Promise<{ words: VocabProgressEntry[]; stats: VocabProgressStats; weak_words: VocabProgressEntry[] }> =>
  apiFetch(`/api/users/${userId}/vocabulary`);

// ── Farm / Orchard ──────────────────────────────────────────────────

export const getFarm = (userId: string): Promise<FarmState> =>
  apiFetch(`/api/users/${userId}/farm`);

export const purchaseFarmItem = (
  userId: string,
  itemType: string,
  gridX: number,
  gridY: number
): Promise<FarmItem> =>
  apiFetch(`/api/users/${userId}/farm/purchase`, {
    method: 'POST',
    body: JSON.stringify({ item_type: itemType, grid_x: gridX, grid_y: gridY }),
  });

export const moveFarmItem = (
  userId: string,
  itemId: number,
  gridX: number,
  gridY: number
): Promise<FarmItem> =>
  apiFetch(`/api/users/${userId}/farm/move`, {
    method: 'PUT',
    body: JSON.stringify({ item_id: itemId, grid_x: gridX, grid_y: gridY }),
  });

export const removeFarmItem = (
  userId: string,
  itemId: number
): Promise<{ ok: boolean }> =>
  apiFetch(`/api/users/${userId}/farm/${itemId}`, { method: 'DELETE' });

// ── Card Collection ─────────────────────────────────────────────

export const getCardCatalog = (): Promise<CardSet[]> =>
  apiFetch('/api/cards/catalog');

export const getUserCards = (userId: string): Promise<UserCardCollection> =>
  apiFetch(`/api/users/${userId}/cards`);

export const purchasePack = (
  userId: string,
  setId: string
): Promise<PackPurchaseResult> =>
  apiFetch(`/api/users/${userId}/cards/purchase`, {
    method: 'POST',
    body: JSON.stringify({ set_id: setId }),
  });

export const getCardsSocial = (): Promise<CardSocialEntry[]> =>
  apiFetch('/api/cards/social');

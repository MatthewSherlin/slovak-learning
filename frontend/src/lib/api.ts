import type {
  DashboardStats,
  Difficulty,
  LearningMode,
  LeaderboardEntry,
  Mode,
  Session,
  SessionFeedback,
  SessionSummary,
  Topic,
  User,
} from './types';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

// Users
export const getUsers = () =>
  request<User[]>('/users');

// Modes & Topics
export const getModes = () =>
  request<Mode[]>('/modes');

export const getTopics = (mode: string) =>
  request<Topic[]>(`/topics/${mode}`);

// Sessions
export const createSession = (data: {
  user_id: string;
  mode: LearningMode;
  topic?: string;
  difficulty: Difficulty;
}) =>
  request<Session>('/sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getSession = (id: string) =>
  request<Session>(`/sessions/${id}`);

export const submitAnswer = (sessionId: string, answer: string) =>
  request<Session>(`/sessions/${sessionId}/answer`, {
    method: 'POST',
    body: JSON.stringify({ answer }),
  });

export const requestHint = (sessionId: string) =>
  request<Session>(`/sessions/${sessionId}/hint`, {
    method: 'POST',
  });

export const endSession = (sessionId: string) =>
  request<SessionFeedback>(`/sessions/${sessionId}/end`, {
    method: 'POST',
  });

export const listSessions = (userId?: string) => {
  const query = userId ? `?user_id=${userId}` : '';
  return request<SessionSummary[]>(`/sessions${query}`);
};

export const deleteSession = (sessionId: string) =>
  request<{ ok: boolean }>(`/sessions/${sessionId}`, {
    method: 'DELETE',
  });

// Dashboard
export const getDashboard = (userId: string) =>
  request<DashboardStats>(`/dashboard?user_id=${userId}`);

// Leaderboard
export const getLeaderboard = () =>
  request<LeaderboardEntry[]>('/leaderboard');

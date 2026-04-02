/**
 * API layer — backed by localStorage + Gemini (no backend server).
 *
 * Wraps sync sessionManager calls in Promises so existing .then() usage
 * in page components continues to work unchanged.
 */

import * as sm from './sessionManager';
import type {
  DashboardStats,
  LeaderboardEntry,
  Mode,
  Session,
  SessionFeedback,
  SessionSummary,
  Topic,
  User,
  LearningMode,
  Difficulty,
} from './types';

// Sync data → wrapped as async for component compatibility
export const getUsers = (): Promise<User[]> =>
  Promise.resolve(sm.getUsers());

export const getModes = (): Promise<Mode[]> =>
  Promise.resolve(sm.getModes());

export const getTopics = (mode: string): Promise<Topic[]> =>
  Promise.resolve(sm.getTopics(mode));

export const getSession = (id: string): Promise<Session> => {
  const s = sm.getSession(id);
  return s ? Promise.resolve(s) : Promise.reject(new Error('Session not found'));
};

export const listSessions = (userId?: string): Promise<SessionSummary[]> =>
  Promise.resolve(sm.listSessions(userId));

export const deleteSession = (sessionId: string): Promise<{ ok: boolean }> =>
  Promise.resolve(sm.deleteSession(sessionId));

export const getDashboard = (userId: string): Promise<DashboardStats> =>
  Promise.resolve(sm.getDashboard(userId));

export const getLeaderboard = (): Promise<LeaderboardEntry[]> =>
  Promise.resolve(sm.getLeaderboard());

// Already async (calls Gemini API)
export const createSession = (data: {
  user_id: string;
  mode: LearningMode;
  topic?: string;
  difficulty: Difficulty;
}): Promise<Session> => sm.createSession(data);

export const submitAnswer = (sessionId: string, answer: string): Promise<Session> =>
  sm.submitAnswer(sessionId, answer);

export const requestHint = (sessionId: string): Promise<Session> =>
  sm.requestHint(sessionId);

export const endSession = (sessionId: string): Promise<SessionFeedback> =>
  sm.endSession(sessionId);

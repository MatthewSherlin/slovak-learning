/**
 * Client-side session management using localStorage.
 * Replaces the FastAPI backend — all data stays in the browser.
 */

import { askGemini, askGeminiJson } from './gemini';
import {
  MODE_PROMPTS,
  HINT_PROMPT,
  FEEDBACK_PROMPT,
} from './prompts';
import { QUESTIONS, TOPICS } from './questions';
import type {
  LearningMode,
  Difficulty,
  Session,
  SessionSummary,
  SessionFeedback,
  Message,
  DashboardStats,
  LeaderboardEntry,
  Mode,
  Topic,
  User,
} from './types';

const SESSIONS_KEY = 'slovak-sessions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function genId(): string {
  return Math.random().toString(36).substring(2, 14);
}

function loadSessions(): Record<string, Session> {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSessions(sessions: Record<string, Session>): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function buildConversation(messages: Message[]): string {
  return messages
    .map((m) => {
      const label = m.role === 'tutor' ? 'Tutor' : m.role === 'student' ? 'Student' : 'System';
      return `${label}: ${m.content}`;
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// Static data (replaces backend /modes and /topics endpoints)
// ---------------------------------------------------------------------------

const USERS: User[] = [
  { id: 'matt', name: 'Matt', avatar: 'M', color: '#5ea4f7' },
  { id: 'zuki', name: 'Zuki', avatar: 'Z', color: '#f0a8d0' },
];

const MODES: Mode[] = [
  { id: 'vocabulary', label: 'Vocabulary', description: 'Build your Slovak word bank', question_count: 20 },
  { id: 'grammar', label: 'Grammar', description: 'Master Slovak grammar rules', question_count: 20 },
  { id: 'conversation', label: 'Conversation', description: 'Practice real conversations', question_count: 15 },
  { id: 'translation', label: 'Translation', description: 'Translate between languages', question_count: 20 },
];

// ---------------------------------------------------------------------------
// Public API — mirrors the old api.ts signatures
// ---------------------------------------------------------------------------

export function getUsers(): User[] {
  return USERS;
}

export function getModes(): Mode[] {
  return MODES;
}

export function getTopics(mode: string): Topic[] {
  const topicMap = TOPICS[mode];
  if (!topicMap) return [];
  return Object.entries(topicMap).map(([id, label]) => ({ id, label }));
}

export async function createSession(data: {
  user_id: string;
  mode: LearningMode;
  topic?: string;
  difficulty: Difficulty;
}): Promise<Session> {
  const topic = data.topic || 'general';
  const modeQuestions = QUESTIONS[data.mode] || {};
  const topicQuestions = modeQuestions[topic] || [];

  const question = topicQuestions.length > 0
    ? topicQuestions[Math.floor(Math.random() * topicQuestions.length)]
    : `Let's practice ${data.mode} focusing on ${topic.replace(/_/g, ' ')}.`;

  const systemPrompt = MODE_PROMPTS[data.mode];
  const difficultyLabel: Record<Difficulty, string> = {
    beginner: 'beginner (A1-A2)',
    intermediate: 'intermediate (B1-B2)',
    advanced: 'advanced (C1-C2)',
  };

  const user = USERS.find((u) => u.id === data.user_id);
  const studentName = user ? user.name : 'Student';

  const topicLabel = TOPICS[data.mode]?.[topic] || topic;

  const fullPrompt =
    `The student's name is ${studentName} and they are at ${difficultyLabel[data.difficulty]} level.\n` +
    `Topic: ${topicLabel}\n\n` +
    `Start the lesson with this focus: ${question}\n\n` +
    `Begin the lesson now. Greet ${studentName} warmly and start teaching.`;

  const response = await askGemini(fullPrompt, systemPrompt);

  const session: Session = {
    id: genId(),
    user_id: data.user_id,
    mode: data.mode,
    topic,
    difficulty: data.difficulty,
    messages: [{ role: 'tutor', content: response }],
    completed: false,
    created_at: new Date().toISOString(),
    feedback: null,
  };

  const sessions = loadSessions();
  sessions[session.id] = session;
  saveSessions(sessions);
  return session;
}

export function getSession(id: string): Session | null {
  const sessions = loadSessions();
  return sessions[id] || null;
}

export async function submitAnswer(sessionId: string, answer: string): Promise<Session> {
  const sessions = loadSessions();
  const session = sessions[sessionId];
  if (!session) throw new Error('Session not found');
  if (session.completed) throw new Error('Session is completed');

  session.messages.push({ role: 'student', content: answer });

  const conversation = buildConversation(session.messages);
  const systemPrompt = MODE_PROMPTS[session.mode];
  const topicLabel = TOPICS[session.mode]?.[session.topic] || session.topic;

  const difficultyLabel: Record<Difficulty, string> = {
    beginner: 'beginner (A1-A2)',
    intermediate: 'intermediate (B1-B2)',
    advanced: 'advanced (C1-C2)',
  };

  const prompt =
    `Student level: ${difficultyLabel[session.difficulty]}\n` +
    `Topic: ${topicLabel}\n\n` +
    `Conversation so far:\n${conversation}\n\n` +
    `Continue the lesson based on the student's last response. ` +
    `Evaluate their answer, provide feedback, and continue teaching.`;

  const response = await askGemini(prompt, systemPrompt);
  session.messages.push({ role: 'tutor', content: response });

  sessions[sessionId] = session;
  saveSessions(sessions);
  return session;
}

export async function requestHint(sessionId: string): Promise<Session> {
  const sessions = loadSessions();
  const session = sessions[sessionId];
  if (!session) throw new Error('Session not found');

  const conversation = buildConversation(session.messages);
  const prompt = `Conversation so far:\n${conversation}\n\nProvide a helpful hint for the student.`;

  const response = await askGemini(prompt, HINT_PROMPT);
  session.messages.push({ role: 'system', content: `💡 ${response}` });

  sessions[sessionId] = session;
  saveSessions(sessions);
  return session;
}

export async function endSession(sessionId: string): Promise<SessionFeedback> {
  const sessions = loadSessions();
  const session = sessions[sessionId];
  if (!session) throw new Error('Session not found');

  const conversation = buildConversation(session.messages);
  const modeLabel = session.mode.charAt(0).toUpperCase() + session.mode.slice(1);
  const topicLabel = TOPICS[session.mode]?.[session.topic] || session.topic;

  const prompt =
    `Mode: ${modeLabel}\n` +
    `Topic: ${topicLabel}\n` +
    `Difficulty: ${session.difficulty}\n\n` +
    `Full session transcript:\n${conversation}\n\n` +
    `Analyze this session and provide feedback as JSON.`;

  const data = await askGeminiJson(prompt, FEEDBACK_PROMPT) as Record<string, unknown>;

  const feedback: SessionFeedback = {
    overall_score: (data.overall_score as number) || 5,
    scores: ((data.scores as Array<Record<string, unknown>>) || []).map((s) => ({
      category: String(s.category || ''),
      score: Number(s.score || 0),
      comment: String(s.comment || ''),
    })),
    strengths: (data.strengths as string[]) || [],
    improvements: (data.improvements as string[]) || [],
    sample_answer: (data.sample_answer as string) || '',
    vocabulary_learned: ((data.vocabulary_learned as Array<Record<string, unknown>>) || []).map((v) => ({
      slovak: String(v.slovak || ''),
      english: String(v.english || ''),
      example: (v.example as string) || null,
    })),
    grammar_notes: (data.grammar_notes as string[]) || [],
  };

  session.completed = true;
  session.feedback = feedback;
  sessions[sessionId] = session;
  saveSessions(sessions);
  return feedback;
}

export function listSessions(userId?: string): SessionSummary[] {
  const sessions = loadSessions();
  let all = Object.values(sessions).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  if (userId) {
    all = all.filter((s) => s.user_id === userId);
  }

  return all.map((s) => {
    const firstMsg = s.messages[0]?.content || '';
    const preview = firstMsg.length > 120 ? firstMsg.substring(0, 120) + '...' : firstMsg;
    return {
      id: s.id,
      user_id: s.user_id,
      mode: s.mode,
      topic: s.topic,
      difficulty: s.difficulty,
      completed: s.completed,
      overall_score: s.feedback?.overall_score ?? null,
      question_preview: preview,
      created_at: s.created_at,
    };
  });
}

export function deleteSession(sessionId: string): { ok: boolean } {
  const sessions = loadSessions();
  if (sessions[sessionId]) {
    delete sessions[sessionId];
    saveSessions(sessions);
    return { ok: true };
  }
  return { ok: false };
}

export function getDashboard(userId: string): DashboardStats {
  const sessions = loadSessions();
  let all = Object.values(sessions).filter((s) => s.user_id === userId);
  const completed = all.filter((s) => s.completed && s.feedback);
  const scores = completed.map((s) => s.feedback!.overall_score);

  const scoresByMode: Record<string, number[]> = {};
  const allStrengths: string[] = [];
  const allWeaknesses: string[] = [];
  let totalVocab = 0;

  for (const s of completed) {
    if (s.feedback) {
      const mode = s.mode;
      if (!scoresByMode[mode]) scoresByMode[mode] = [];
      scoresByMode[mode].push(s.feedback.overall_score);
      allStrengths.push(...s.feedback.strengths.slice(0, 2));
      allWeaknesses.push(...s.feedback.improvements.slice(0, 2));
      totalVocab += s.feedback.vocabulary_learned.length;
    }
  }

  const avgByMode: Record<string, number> = {};
  for (const [m, v] of Object.entries(scoresByMode)) {
    avgByMode[m] = v.reduce((a, b) => a + b, 0) / v.length;
  }

  const recentSummaries = listSessions(userId).slice(0, 5);

  return {
    total_sessions: all.length,
    completed_sessions: completed.length,
    avg_score: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    scores_by_mode: avgByMode,
    strong_areas: [...new Set(allStrengths)].slice(0, 5),
    weak_areas: [...new Set(allWeaknesses)].slice(0, 5),
    recent_sessions: recentSummaries,
    vocab_count: totalVocab,
  };
}

function calculateXP(userSessions: Session[]): number {
  let xp = 0;
  for (const s of userSessions) {
    if (s.completed && s.feedback) {
      xp += 10;
      xp += Math.floor(s.feedback.overall_score * 2);
      xp += s.feedback.vocabulary_learned.length * 2;
    }
  }
  return xp;
}

function calculateStreak(userSessions: Session[]): number {
  const completedDates = new Set<string>();
  for (const s of userSessions) {
    if (s.completed) {
      try {
        const dt = new Date(s.created_at);
        completedDates.add(dt.toISOString().split('T')[0]);
      } catch {
        // skip
      }
    }
  }

  if (completedDates.size === 0) return 0;

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  let streak = 0;
  const current = new Date(today);

  // Check from today backward
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  if (completedDates.has(todayStr)) {
    while (completedDates.has(fmt(current))) {
      streak++;
      current.setDate(current.getDate() - 1);
    }
  } else {
    // Check if yesterday starts a streak
    current.setDate(current.getDate() - 1);
    while (completedDates.has(fmt(current))) {
      streak++;
      current.setDate(current.getDate() - 1);
    }
  }

  return streak;
}

export function getLeaderboard(): LeaderboardEntry[] {
  const sessions = loadSessions();
  const allSessions = Object.values(sessions);

  return USERS.map((user) => {
    const userSessions = allSessions.filter((s) => s.user_id === user.id);
    const completed = userSessions.filter((s) => s.completed && s.feedback);
    const scores = completed.map((s) => s.feedback!.overall_score);
    const totalVocab = completed.reduce(
      (sum, s) => sum + (s.feedback?.vocabulary_learned.length || 0),
      0,
    );

    return {
      user_id: user.id,
      name: user.name,
      avatar: user.avatar,
      color: user.color,
      total_sessions: userSessions.length,
      completed_sessions: completed.length,
      avg_score: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      total_vocab: totalVocab,
      streak_days: calculateStreak(userSessions),
      xp: calculateXP(userSessions),
    };
  }).sort((a, b) => b.xp - a.xp);
}

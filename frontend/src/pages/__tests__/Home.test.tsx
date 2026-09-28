import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Home from '../Home';
import type { Recommendations, DashboardStats, LeaderboardEntry, Session } from '../../lib/types';

// ── Mock the API module ───────────────────────────────────────────────

vi.mock('../../lib/api', () => ({
  getRecommendations: vi.fn(),
  getDashboard: vi.fn(),
  getLeaderboard: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  deleteSession: vi.fn(),
  getTopics: vi.fn(() => Promise.resolve([])),
  listSessions: vi.fn(() => Promise.resolve([])),
}));

// ── Mock useUser ──────────────────────────────────────────────────────

vi.mock('../../components/UserPicker', () => ({
  useUser: () => ({
    user: { id: 'user-1', name: 'Matt', avatar: 'M', color: '#5ea4f7', has_pin: false },
  }),
}));

import * as api from '../../lib/api';

// ── Vocab session fixture (3 of 10 answered) ─────────────────────────

function makeVocabSession(answeredCount: number, total: number): Session {
  const answers = Array.from({ length: total }, (_, i) =>
    i < answeredCount ? i % 4 : null
  ) as (number | null)[];
  return {
    id: 'sess-vocab-1',
    user_id: 'user-1',
    mode: 'vocabulary',
    topic: 'Animals',
    difficulty: 'beginner',
    messages: [],
    completed: false,
    created_at: new Date().toISOString(),
    feedback: null,
    exercises: {
      type: 'vocabulary',
      questions: Array.from({ length: total }, (_, i) => ({
        word: `word${i}`,
        direction: 'sk-en' as const,
        choices: ['a', 'b', 'c', 'd'],
        correctIndex: 0,
        explanation: '',
      })),
      currentIndex: answeredCount,
      answers,
      retryQueue: [],
      phase: 'questions' as const,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

const mockStats: DashboardStats = {
  total_sessions: 10,
  completed_sessions: 8,
  avg_score: 7.5,
  scores_by_mode: { grammar: 6.8, vocabulary: 8.2 },
  strong_areas: ['vocabulary'],
  weak_areas: ['grammar'],
  recent_sessions: [],
  vocab_count: 182,
};

const mockLeaderboard: LeaderboardEntry[] = [
  {
    user_id: 'user-1',
    name: 'Matt',
    avatar: 'M',
    color: '#5ea4f7',
    total_sessions: 10,
    completed_sessions: 8,
    avg_score: 7.5,
    total_vocab: 182,
    streak_days: 6,
    xp: 1200,
  },
];

function baseRecs(overrides: Partial<Recommendations> = {}): Recommendations {
  return {
    in_progress_session: null,
    due_words: 0,
    weakest_concept: null,
    recommended: [],
    ...overrides,
  };
}

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Home', () => {
  beforeEach(() => {
    vi.mocked(api.getDashboard).mockResolvedValue(mockStats);
    vi.mocked(api.getLeaderboard).mockResolvedValue(mockLeaderboard);
    // Default: getSession resolves to a vocab session with no progress
    vi.mocked(api.getSession).mockResolvedValue(makeVocabSession(0, 10));
  });

  it('renders the Continue card when in_progress_session exists', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue(
      baseRecs({
        in_progress_session: {
          id: 'sess-abc',
          mode: 'grammar',
          topic: 'Noun Cases',
          difficulty: 'beginner',
          created_at: new Date().toISOString(),
        },
      })
    );

    renderHome();

    await waitFor(() => {
      const el = screen.queryByText(/continue session/i);
      expect(el).not.toBeNull();
    });
  });

  it('gives the Continue card dismiss button a 44 by 44 tap target outside the card', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue(
      baseRecs({
        in_progress_session: {
          id: 'sess-abc',
          mode: 'grammar',
          topic: 'Noun Cases',
          difficulty: 'beginner',
          created_at: new Date().toISOString(),
        },
      })
    );

    renderHome();

    const dismiss = await screen.findByRole('button', { name: /discard this session/i });
    // jsdom does not compute layout, so this checks the classes that set the size.
    expect(dismiss.className).toMatch(/\bw-11\b/);
    expect(dismiss.className).toMatch(/\bh-11\b/);
    const card = screen.getByText(/continue session/i).closest('[role="button"]');
    expect(card).not.toBeNull();
    expect(card!.contains(dismiss)).toBe(false);
  });

  it('dismissing the Continue card discards the session without opening it', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue(
      baseRecs({
        in_progress_session: {
          id: 'sess-abc',
          mode: 'grammar',
          topic: 'Noun Cases',
          difficulty: 'beginner',
          created_at: new Date().toISOString(),
        },
      })
    );
    vi.mocked(api.deleteSession).mockResolvedValue({ ok: true });

    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/session/:id" element={<p>Session page</p>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /discard this session/i }));

    await waitFor(() => {
      expect(api.deleteSession).toHaveBeenCalledWith('sess-abc');
    });
    expect(screen.queryByText('Session page')).toBeNull();
  });

  it('does NOT render the Continue card when in_progress_session is null', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue(baseRecs());

    renderHome();

    // Wait for data to load (mode grid should appear)
    await waitFor(() => {
      expect(screen.queryByText('Vocabulary')).not.toBeNull();
    });

    expect(screen.queryByText(/continue session/i)).toBeNull();
  });

  it('shows the error state and retry button on fetch rejection', async () => {
    vi.mocked(api.getRecommendations).mockRejectedValue(new Error('Network error'));

    renderHome();

    await waitFor(() => {
      expect(screen.queryByText(/couldn't load your home screen/i)).not.toBeNull();
    });

    // Retry button must exist
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
    // Must NOT contain "port 8888" copy
    expect(screen.queryByText(/8888/)).toBeNull();
  });

  it('shows the greeting with the user name', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue(baseRecs());

    renderHome();

    await waitFor(() => {
      expect(screen.queryByText(/Ahoj/)).not.toBeNull();
    });
  });

  it('renders mode grid with all four modes', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue(baseRecs());

    renderHome();

    await waitFor(() => {
      expect(screen.queryByText('Vocabulary')).not.toBeNull();
    });

    expect(screen.queryByText('Grammar')).not.toBeNull();
    expect(screen.queryByText('Conversation')).not.toBeNull();
    expect(screen.queryByText('Translation')).not.toBeNull();
  });

  it('renders recommended chips when recommendations include review_vocab', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue(
      baseRecs({
        recommended: [
          { kind: 'review_vocab', label: 'Review 5 due words', mode: 'vocabulary' },
        ],
      })
    );

    renderHome();

    await waitFor(() => {
      expect(screen.queryByText('Review 5 due words')).not.toBeNull();
    });
  });

  it('gives the review chip a tap target at least 44px tall', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue(
      baseRecs({
        recommended: [
          { kind: 'review_vocab', label: 'Review 5 due words', mode: 'vocabulary' },
        ],
      })
    );

    renderHome();

    const chip = await screen.findByRole('button', { name: /review 5 due words/i });
    // jsdom does not compute layout, so this checks the class that sets the height.
    expect(chip.className).toMatch(/\bmin-h-11\b/);
  });

  it('opens the start sheet with review on when the review chip is tapped', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue(
      baseRecs({
        recommended: [
          { kind: 'review_vocab', label: 'Review 5 due words', mode: 'vocabulary' },
        ],
      })
    );

    renderHome();

    await waitFor(() => {
      expect(screen.queryByText('Review 5 due words')).not.toBeNull();
    });
    fireEvent.click(screen.getByText('Review 5 due words'));

    const toggle = await screen.findByRole('switch', { name: /include review words/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('shows real "3/10" progress fraction in Continue card when getSession returns 3 of 10 answered', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue(
      baseRecs({
        in_progress_session: {
          id: 'sess-vocab-1',
          mode: 'vocabulary',
          topic: 'Animals',
          difficulty: 'beginner',
          created_at: new Date().toISOString(),
        },
      })
    );
    vi.mocked(api.getSession).mockResolvedValue(makeVocabSession(3, 10));

    renderHome();

    await waitFor(() => {
      expect(screen.queryByText('3/10')).not.toBeNull();
    });
  });

  it('clicking the gear button opens the settings modal', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue(baseRecs());

    renderHome();

    await waitFor(() => {
      expect(screen.queryByText('Vocabulary')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: /^settings$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /^settings$/i })).not.toBeNull();
    });
  });

  it('renders Continue card without the progress ring when getSession rejects (graceful fallback)', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue(
      baseRecs({
        in_progress_session: {
          id: 'sess-error',
          mode: 'vocabulary',
          topic: 'Animals',
          difficulty: 'beginner',
          created_at: new Date().toISOString(),
        },
      })
    );
    vi.mocked(api.getSession).mockRejectedValue(new Error('Network error'));

    renderHome();

    // Card still shows "Continue session" label
    await waitFor(() => {
      expect(screen.queryByText(/continue session/i)).not.toBeNull();
    });

    // But the progress fraction must NOT appear (no ring rendered)
    expect(screen.queryByText(/\d+\/\d+/)).toBeNull();
  });
});

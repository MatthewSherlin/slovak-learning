import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Stats from '../Stats';
import type { DashboardStats, LeaderboardEntry, SessionSummary } from '../../lib/types';

// ── Mock the API module ───────────────────────────────────────────────

vi.mock('../../lib/api', () => ({
  getDashboard: vi.fn(),
  getLeaderboard: vi.fn(),
  listSessions: vi.fn(),
  deleteSession: vi.fn(),
}));

// ── Mock useUser ──────────────────────────────────────────────────────

vi.mock('../../components/UserPicker', () => ({
  useUser: () => ({
    user: { id: 'user-1', name: 'Matt', avatar: 'M', color: '#5ea4f7', has_pin: false },
  }),
}));

import * as api from '../../lib/api';

// ── Fixtures ──────────────────────────────────────────────────────────

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
    xp: 2450,
  },
  {
    user_id: 'user-2',
    name: 'Zoe',
    avatar: 'Z',
    color: '#f472b6',
    total_sessions: 8,
    completed_sessions: 6,
    avg_score: 6.5,
    total_vocab: 120,
    streak_days: 3,
    xp: 1980,
  },
];

const mockSessions: SessionSummary[] = [
  {
    id: 'sess-1',
    user_id: 'user-1',
    mode: 'vocabulary',
    topic: 'Animals',
    difficulty: 'beginner',
    completed: true,
    overall_score: 8.5,
    question_preview: 'What is cat?',
    created_at: new Date().toISOString(),
  },
  {
    id: 'sess-2',
    user_id: 'user-1',
    mode: 'grammar',
    topic: 'Noun Cases',
    difficulty: 'intermediate',
    completed: false,
    overall_score: null,
    question_preview: 'Fill in the blank...',
    created_at: new Date().toISOString(),
  },
];

// ── Render helpers ────────────────────────────────────────────────────

function renderStats(tab = 'overview') {
  return render(
    <MemoryRouter initialEntries={[`/stats?tab=${tab}`]}>
      <Stats />
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Stats', () => {
  beforeEach(() => {
    vi.mocked(api.getDashboard).mockResolvedValue(mockStats);
    vi.mocked(api.getLeaderboard).mockResolvedValue(mockLeaderboard);
    vi.mocked(api.listSessions).mockResolvedValue(mockSessions);
    vi.mocked(api.deleteSession).mockResolvedValue({ ok: true });
  });

  // ── Tab switching ────────────────────────────────────────────────

  it('renders the Overview tab by default', async () => {
    renderStats('overview');
    await waitFor(() => {
      expect(screen.queryByText('XP race')).not.toBeNull();
    });
  });

  it('renders the History tab when ?tab=history', async () => {
    renderStats('history');
    await waitFor(() => {
      expect(screen.queryByText(/Animals/i)).not.toBeNull();
    });
  });

  it('renders the Friends tab when ?tab=leaderboard (legacy)', async () => {
    renderStats('leaderboard');
    await waitFor(() => {
      expect(screen.queryByText(/Head-to-Head/i)).not.toBeNull();
    });
  });

  it('renders the Friends tab when ?tab=friends', async () => {
    renderStats('friends');
    await waitFor(() => {
      expect(screen.queryByText(/Head-to-Head/i)).not.toBeNull();
    });
  });

  it('switches to History panel when History tab is clicked', async () => {
    renderStats('overview');

    // Wait for overview to load
    await waitFor(() => {
      expect(screen.queryByText('XP race')).not.toBeNull();
    });

    // Click History tab
    fireEvent.click(screen.getByRole('button', { name: /history/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Animals/i)).not.toBeNull();
    });
  });

  it('switches to Friends panel when Friends tab is clicked', async () => {
    renderStats('overview');

    await waitFor(() => {
      expect(screen.queryByText('XP race')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: /friends/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Head-to-Head/i)).not.toBeNull();
    });
  });

  // ── Overview panel ────────────────────────────────────────────────

  it('shows XP race bars in Overview with both user avatars', async () => {
    renderStats('overview');
    await waitFor(() => {
      expect(screen.queryByText('XP race')).not.toBeNull();
    });
    // Both users' avatars appear in the XP race bars
    expect(screen.queryByText('M')).not.toBeNull();
    expect(screen.queryByText('Z')).not.toBeNull();
  });

  it('shows stat cards in Overview', async () => {
    renderStats('overview');
    await waitFor(() => {
      expect(screen.queryByText('Day streak')).not.toBeNull();
    });
    expect(screen.queryByText('Avg score')).not.toBeNull();
    expect(screen.queryByText('Words learned')).not.toBeNull();
    expect(screen.queryByText('Sessions')).not.toBeNull();
  });

  it('shows By category section in Overview', async () => {
    renderStats('overview');
    await waitFor(() => {
      expect(screen.queryByText('By category')).not.toBeNull();
    });
  });

  // ── Error states & retry (bug fix #10) ───────────────────────────

  it('shows retry UI when leaderboard fetch fails on Friends tab', async () => {
    vi.mocked(api.getLeaderboard).mockRejectedValue(new Error('Network error'));

    renderStats('friends');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeNull();
    });
  });

  it('shows retry UI when dashboard fetch fails on Overview tab', async () => {
    vi.mocked(api.getDashboard).mockRejectedValue(new Error('Network error'));

    renderStats('overview');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeNull();
    });
  });

  it('shows retry UI when sessions fetch fails on History tab', async () => {
    vi.mocked(api.listSessions).mockRejectedValue(new Error('Network error'));

    renderStats('history');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeNull();
    });
  });

  // ── History delete — bug fix #6 ───────────────────────────────────

  it('keeps session in list when delete API call fails', async () => {
    vi.mocked(api.deleteSession).mockRejectedValue(new Error('Server error'));

    renderStats('history');

    await waitFor(() => {
      expect(screen.queryByText(/Animals/i)).not.toBeNull();
    });

    // Confirm the delete prompt
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    // Hover to reveal delete button and click it
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    fireEvent.click(deleteButtons[0]);

    // Wait a tick and verify session still in list
    await waitFor(() => {
      expect(screen.queryByText(/Animals/i)).not.toBeNull();
    });
  });

  it('shows error message when delete API call fails', async () => {
    vi.mocked(api.deleteSession).mockRejectedValue(new Error('Server error'));

    renderStats('history');

    await waitFor(() => {
      expect(screen.queryByText(/Animals/i)).not.toBeNull();
    });

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText(/failed to delete/i)).not.toBeNull();
    });
  });

  // ── Friends H2H — bug fix #22 ─────────────────────────────────────

  it('renders Head-to-Head section with two selects', async () => {
    renderStats('friends');

    await waitFor(() => {
      expect(screen.queryByText(/Head-to-Head/i)).not.toBeNull();
    });

    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });
});

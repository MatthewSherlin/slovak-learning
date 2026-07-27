import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ConfigSheet from '../ConfigSheet';
import type { Topic } from '../../lib/types';

// ── Mock the API module ─────────────────────────────────────────────────

vi.mock('../../lib/api', () => ({
  getTopics: vi.fn(),
  createSession: vi.fn(),
}));

// ── Mock useNavigate ────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  };
});

import * as api from '../../lib/api';

// ── Fixtures ────────────────────────────────────────────────────────────

const MOCK_TOPICS: Topic[] = [
  { id: 'greetings', label: 'Greetings & Basics' },
  { id: 'food', label: 'Food & Drink' },
  { id: 'numbers', label: 'Numbers & Time' },
];

function renderSheet(props: Partial<React.ComponentProps<typeof ConfigSheet>> = {}) {
  return render(
    <MemoryRouter>
      <ConfigSheet
        mode="vocabulary"
        open={true}
        onClose={vi.fn()}
        userId="user-1"
        {...props}
      />
    </MemoryRouter>
  );
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ConfigSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getTopics).mockResolvedValue(MOCK_TOPICS);
    vi.mocked(api.createSession).mockResolvedValue({
      id: 'sess-new',
      user_id: 'user-1',
      mode: 'vocabulary',
      topic: '',
      difficulty: 'beginner',
      messages: [],
      completed: false,
      created_at: new Date().toISOString(),
      feedback: null,
    });
    mockNavigate.mockClear();
  });

  it('renders 3 difficulty pills: Beginner, Intermediate, Advanced', async () => {
    renderSheet();
    expect(screen.getByRole('button', { name: /beginner/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /intermediate/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /advanced/i })).toBeTruthy();
  });

  it('defaults to Beginner pill selected', async () => {
    renderSheet();
    const beginner = screen.getByRole('button', { name: /beginner/i });
    // The selected pill has different styling — check aria-pressed or data attribute
    expect(beginner.getAttribute('aria-pressed')).toBe('true');
  });

  it('switches selection when another difficulty pill is clicked', async () => {
    renderSheet();
    const intermediate = screen.getByRole('button', { name: /intermediate/i });
    fireEvent.click(intermediate);
    expect(intermediate.getAttribute('aria-pressed')).toBe('true');
    const beginner = screen.getByRole('button', { name: /beginner/i });
    expect(beginner.getAttribute('aria-pressed')).toBe('false');
  });

  it('calls createSession with selected difficulty and navigates to /session/{id}', async () => {
    renderSheet();
    // Switch to Advanced
    fireEvent.click(screen.getByRole('button', { name: /advanced/i }));
    // Submit
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => {
      expect(api.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          mode: 'vocabulary',
          difficulty: 'advanced',
        })
      );
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/session/sess-new');
    });
  });

  it('passes instructions to createSession when text is provided', async () => {
    renderSheet();
    const textarea = screen.getByPlaceholderText(/restaurant vocabulary/i);
    fireEvent.change(textarea, { target: { value: "don't use words from last session" } });
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => {
      expect(api.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          instructions: "don't use words from last session",
        })
      );
    });
  });

  it('omits instructions when the box is empty', async () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => {
      expect(api.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ instructions: undefined })
      );
    });
  });

  it('shows an error when instructions exceed 300 characters', async () => {
    renderSheet();
    const textarea = screen.getByPlaceholderText(/restaurant vocabulary/i);
    fireEvent.change(textarea, { target: { value: 'x'.repeat(301) } });
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => {
      expect(screen.queryByText(/300 characters/i)).not.toBeNull();
    });
    expect(api.createSession).not.toHaveBeenCalled();
  });

  it('calls onClose when the close / backdrop is tapped', async () => {
    const onClose = vi.fn();
    renderSheet({ onClose });
    const backdrop = screen.getByTestId('config-sheet-backdrop');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders topic chips after topics load', async () => {
    renderSheet();
    await waitFor(() => {
      expect(screen.queryByText('Greetings & Basics')).not.toBeNull();
    });
  });

  it('pre-selects a topic chip when recommendedTopic prop is set', async () => {
    renderSheet({ recommendedTopic: 'greetings' });
    await waitFor(() => {
      expect(screen.queryByText('Greetings & Basics')).not.toBeNull();
    });
    const chip = screen.getByRole('button', { name: /greetings/i });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
  });

  it('does not render when open is false', () => {
    renderSheet({ open: false });
    expect(screen.queryByRole('button', { name: /start session/i })).toBeNull();
  });

  it('renders the mode title in the header', async () => {
    renderSheet({ mode: 'grammar' });
    expect(screen.getByText(/grammar session/i)).toBeTruthy();
  });
});

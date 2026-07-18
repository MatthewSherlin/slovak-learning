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

  it('focus-area input rejects more than 100 characters with an inline error', async () => {
    renderSheet();
    const textarea = screen.getByPlaceholderText(/restaurant vocabulary/i);
    const longText = 'a'.repeat(101);
    fireEvent.change(textarea, { target: { value: longText } });
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => {
      expect(screen.queryByText(/100 characters/i)).not.toBeNull();
    });
    expect(api.createSession).not.toHaveBeenCalled();
  });

  it('focus-area input accepts text up to 100 characters without error', async () => {
    renderSheet();
    const textarea = screen.getByPlaceholderText(/restaurant vocabulary/i);
    const exactText = 'a'.repeat(100);
    fireEvent.change(textarea, { target: { value: exactText } });
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => {
      expect(api.createSession).toHaveBeenCalled();
    });
    expect(screen.queryByText(/100 characters/i)).toBeNull();
  });

  it('passes focus_areas to createSession when focus text is provided', async () => {
    renderSheet();
    const textarea = screen.getByPlaceholderText(/restaurant vocabulary/i);
    fireEvent.change(textarea, { target: { value: 'restaurant vocabulary' } });
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => {
      expect(api.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          focus_areas: ['restaurant vocabulary'],
        })
      );
    });
  });

  it('parses comma-separated focus areas into an array', async () => {
    renderSheet();
    const textarea = screen.getByPlaceholderText(/restaurant vocabulary/i);
    fireEvent.change(textarea, { target: { value: 'a, b, c' } });
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => {
      expect(api.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          focus_areas: ['a', 'b', 'c'],
        })
      );
    });
  });

  it('shows max-10 error and blocks submit when more than 10 comma-separated items are entered', async () => {
    renderSheet();
    const textarea = screen.getByPlaceholderText(/restaurant vocabulary/i);
    const elevenItems = Array.from({ length: 11 }, (_, i) => `item${i + 1}`).join(', ');
    fireEvent.change(textarea, { target: { value: elevenItems } });
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => {
      expect(screen.queryByText(/max 10 focus areas/i)).not.toBeNull();
    });
    expect(api.createSession).not.toHaveBeenCalled();
  });

  it('rejects any individual focus area item longer than 100 characters', async () => {
    renderSheet();
    const textarea = screen.getByPlaceholderText(/restaurant vocabulary/i);
    const longItem = 'a'.repeat(101);
    fireEvent.change(textarea, { target: { value: `short, ${longItem}` } });
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => {
      expect(screen.queryByText(/100 characters/i)).not.toBeNull();
    });
    expect(api.createSession).not.toHaveBeenCalled();
  });

  it('shows N/10 counter when 2 or more comma-separated items are present', async () => {
    renderSheet();
    const textarea = screen.getByPlaceholderText(/restaurant vocabulary/i);
    fireEvent.change(textarea, { target: { value: 'food, drinks' } });

    await waitFor(() => {
      expect(screen.queryByText(/2\/10/)).not.toBeNull();
    });
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

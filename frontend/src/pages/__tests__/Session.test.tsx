import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import Session from '../Session';
import type { Session as SessionType } from '../../lib/types';

vi.mock('../../lib/api', () => ({
  getSession: vi.fn(),
  submitAnswer: vi.fn(),
  requestHint: vi.fn(),
  endSession: vi.fn(),
}));

vi.mock('../../components/UserPicker', () => ({
  useUser: () => ({
    user: { id: 'user-1', name: 'Matt', avatar: 'M', color: '#5ea4f7', has_pin: false },
  }),
}));

vi.mock('../../components/ChatMessage', () => ({ default: () => null }));

import * as api from '../../lib/api';

beforeAll(() => {
  // jsdom has no scrollIntoView; the chat scrolls to its end on render.
  Element.prototype.scrollIntoView = vi.fn();
});

// A session from before lessons had structured exercises renders the legacy chat.
function makeLegacySession(): SessionType {
  return {
    id: 's-legacy',
    user_id: 'user-1',
    mode: 'conversation',
    topic: 'cafe',
    difficulty: 'beginner',
    messages: [{ role: 'tutor', content: 'Dobrý deň!' }],
    completed: false,
    created_at: new Date().toISOString(),
    feedback: null,
  };
}

describe('Session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses a 16px font on the legacy chat box so iOS does not zoom in', async () => {
    vi.mocked(api.getSession).mockResolvedValue(makeLegacySession());
    render(
      <MemoryRouter initialEntries={['/session/s-legacy']}>
        <Routes>
          <Route path="/session/:id" element={<Session />} />
        </Routes>
      </MemoryRouter>
    );
    const box = await screen.findByRole('textbox');
    expect(box.className).toMatch(/\btext-\[16px\]/);
  });

  it('labels the legacy chat end button "End lesson"', async () => {
    vi.mocked(api.getSession).mockResolvedValue(makeLegacySession());
    render(
      <MemoryRouter initialEntries={['/session/s-legacy']}>
        <Routes>
          <Route path="/session/:id" element={<Session />} />
        </Routes>
      </MemoryRouter>
    );
    const end = await screen.findByRole('button', { name: 'End lesson and get feedback' });
    expect(end.textContent).toBe('End lesson');
  });

  it('renders a session handed over in router state without fetching it', () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/session/s-legacy', state: { session: makeLegacySession() } }]}
      >
        <Routes>
          <Route path="/session/:id" element={<Session />} />
        </Routes>
      </MemoryRouter>
    );
    // Rendered at once, not after a loader.
    expect(screen.getByRole('button', { name: 'End lesson and get feedback' })).toBeTruthy();
    expect(api.getSession).not.toHaveBeenCalled();
  });

  it('clears the handed-over session from the history entry once it has used it', () => {
    // Browsers keep history state across a reload and Back: a snapshot left
    // there would show the lesson as it was when it was created.
    function StateProbe() {
      return <div data-testid="route-state">{JSON.stringify(useLocation().state)}</div>;
    }
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/session/s-legacy', state: { session: makeLegacySession() } }]}
      >
        <Routes>
          <Route path="/session/:id" element={<><Session /><StateProbe /></>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('route-state').textContent).toBe('null');
    expect(screen.getByRole('button', { name: 'End lesson and get feedback' })).toBeTruthy();
    expect(api.getSession).not.toHaveBeenCalled();
  });

  it('fetches when the session in router state is for another id', async () => {
    vi.mocked(api.getSession).mockResolvedValue({ ...makeLegacySession(), id: 's-other' });
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/session/s-other', state: { session: makeLegacySession() } }]}
      >
        <Routes>
          <Route path="/session/:id" element={<Session />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByRole('button', { name: 'End lesson and get feedback' });
    expect(api.getSession).toHaveBeenCalledWith('s-other');
  });

  it('applies the ownership guard to a session handed over in router state', () => {
    const theirs = { ...makeLegacySession(), user_id: 'user-2' };
    render(
      <MemoryRouter initialEntries={[{ pathname: '/session/s-legacy', state: { session: theirs } }]}>
        <Routes>
          <Route path="/session/:id" element={<Session />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Not your session')).toBeTruthy();
  });

  it('shows the branded loader while it fetches the session', () => {
    vi.mocked(api.getSession).mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter initialEntries={['/session/s-legacy']}>
        <Routes>
          <Route path="/session/:id" element={<Session />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(screen.queryByText('Loading session')).toBeNull();
  });
});

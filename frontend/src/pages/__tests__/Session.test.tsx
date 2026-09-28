import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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
});

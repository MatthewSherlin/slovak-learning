import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ConversationMode from '../ConversationMode';
import * as api from '../../lib/api';
import type { Session } from '../../lib/types';

vi.mock('../../lib/api', () => ({
  submitAnswer: vi.fn(),
  requestHint: vi.fn(),
  endSession: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const motion = new Proxy({} as any, {
    get: (_target: unknown, tag: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return React.forwardRef(({ children, ...props }: any, ref: any) => {
        return React.createElement(tag, { ...props, ref }, children);
      });
    },
  });
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useReducedMotion: () => false,
  };
});

vi.mock('../SessionHeader', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ children }: { children: any }) => children ?? null,
}));
vi.mock('../LoadingDots', () => ({ default: () => null }));
vi.mock('../FeedbackView', () => ({ default: () => null }));
vi.mock('../DiacriticsKeyboard', () => ({ default: () => null }));
vi.mock('../ChatMessage', () => ({ default: () => null }));

beforeAll(() => {
  // jsdom has no scrollIntoView; the chat scrolls to its end on render.
  Element.prototype.scrollIntoView = vi.fn();
});

function makeSession(): Session {
  return {
    id: 's-1',
    user_id: 'user-1',
    mode: 'conversation',
    topic: 'cafe',
    difficulty: 'beginner',
    messages: [{ role: 'tutor', content: 'Dobrý deň!' }],
    completed: false,
    created_at: new Date().toISOString(),
    feedback: null,
    exercises: { type: 'conversation', exchangeCount: 0, maxExchanges: 8, phase: 'active' },
  };
}

describe('ConversationMode', () => {
  it('uses a 16px font on the reply box so iOS does not zoom in', () => {
    render(
      <MemoryRouter>
        <ConversationMode session={makeSession()} setSession={() => {}} />
      </MemoryRouter>
    );
    const box = screen.getByRole('textbox');
    expect(box.className).toMatch(/\btext-\[16px\]/);
  });

  it('ends the lesson with no analysis text, and the shared loader only if it takes a while', async () => {
    vi.mocked(api.endSession).mockReturnValue(new Promise(() => {}));
    const session = makeSession();
    session.messages = [...session.messages, { role: 'student', content: 'Ahoj' }];
    session.exercises = { type: 'conversation', exchangeCount: 8, maxExchanges: 8, phase: 'complete' };
    render(
      <MemoryRouter>
        <ConversationMode session={session} setSession={() => {}} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /get feedback/i }));
    expect(api.endSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/analy[sz]ing|generating|preparing feedback/i)).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    await waitFor(() => expect(screen.getAllByRole('progressbar')).toHaveLength(1));
    expect(screen.queryByText(/analy[sz]ing|generating|preparing feedback/i)).toBeNull();
  });
});

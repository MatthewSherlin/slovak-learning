import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SessionHeader from '../SessionHeader';
import type { Session } from '../../lib/types';

function makeSession(instructions?: string): Session {
  return {
    id: 's-1',
    user_id: 'user-1',
    mode: 'vocabulary',
    topic: 'food_drink',
    difficulty: 'beginner',
    messages: [],
    completed: false,
    created_at: new Date().toISOString(),
    feedback: null,
    exercises: {
      type: 'vocabulary',
      questions: [],
      currentIndex: 0,
      answers: [],
      retryQueue: [],
      phase: 'questions',
      instructions,
    },
  };
}

function renderHeader(session: Session) {
  return render(
    <MemoryRouter>
      <SessionHeader session={session} onEnd={() => {}} ending={false} />
    </MemoryRouter>
  );
}

describe('SessionHeader', () => {
  it('shows the focus the session was built with', () => {
    renderHeader(makeSession('I want to learn about food'));
    expect(screen.getByText('Focus: I want to learn about food')).toBeTruthy();
  });

  it('shows no focus line when none was given', () => {
    renderHeader(makeSession());
    expect(screen.queryByText(/^Focus:/)).toBeNull();
  });

  it('still shows a session that has no exercises', () => {
    const session = { ...makeSession(), exercises: undefined };
    renderHeader(session);
    expect(screen.getByText('Vocabulary')).toBeTruthy();
    expect(screen.queryByText(/^Focus:/)).toBeNull();
  });

  it('labels the end button "End lesson" and keeps the full name for screen readers', () => {
    renderHeader(makeSession());
    const end = screen.getByRole('button', { name: 'End lesson and get feedback' });
    expect(end.textContent).toBe('End lesson');
  });

  it('gives the back arrow a 44 by 44 tap target', () => {
    renderHeader(makeSession());
    // jsdom does not compute layout, so this checks the classes that set the size.
    const back = screen.getByTitle('Leave session');
    expect(back.className).toMatch(/\bw-11\b/);
    expect(back.className).toMatch(/\bh-11\b/);
  });
});

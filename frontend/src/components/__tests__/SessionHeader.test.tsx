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
});

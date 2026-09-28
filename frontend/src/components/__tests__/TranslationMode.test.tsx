import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TranslationMode from '../TranslationMode';
import type { Session, TranslationExercise } from '../../lib/types';

vi.mock('../../lib/api', () => ({
  submitTranslation: vi.fn(),
  endSession: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('../../lib/sounds', () => ({
  playCorrect: vi.fn(),
  playIncorrect: vi.fn(),
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
  };
});

vi.mock('../SessionHeader', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ children }: { children: any }) => children ?? null,
}));
vi.mock('../ProgressBar', () => ({ default: () => null }));
vi.mock('../LoadingDots', () => ({ default: () => null }));
vi.mock('../FeedbackView', () => ({ default: () => null }));
vi.mock('../DiacriticsKeyboard', () => ({ default: () => null }));

function makeSession(exercise: TranslationExercise): Session {
  return {
    id: 'tr-1',
    user_id: 'user-1',
    mode: 'translation',
    topic: 'general',
    difficulty: 'beginner',
    messages: [],
    completed: false,
    created_at: new Date().toISOString(),
    feedback: null,
    exercises: {
      type: 'translation',
      exercises: [exercise],
      currentIndex: 0,
      answers: [null],
      phase: 'exercises',
    },
  };
}

function renderMode(exercise: TranslationExercise) {
  return render(
    <MemoryRouter>
      <TranslationMode session={makeSession(exercise)} setSession={() => {}} />
    </MemoryRouter>
  );
}

describe('TranslationMode', () => {
  it('shows a translation to Slovak with autocorrect off', () => {
    renderMode({ source: 'I have water.', direction: 'en-sk', modelAnswer: 'Mám vodu.', keyPoints: [] });
    expect(screen.getByText('Translate to Slovak')).toBeTruthy();
    const box = screen.getByPlaceholderText('Type your translation...');
    expect(box.getAttribute('autocorrect')).toBe('off');
    expect(box.getAttribute('autocapitalize')).toBe('none');
    expect(box.getAttribute('spellcheck')).toBe('false');
  });

  it('keeps autocorrect for answers typed in English', () => {
    renderMode({ source: 'Mám vodu.', direction: 'sk-en', modelAnswer: 'I have water.', keyPoints: [] });
    expect(screen.getByText('Translate to English')).toBeTruthy();
    const box = screen.getByPlaceholderText('Type your translation...');
    expect(box.getAttribute('autocorrect')).toBeNull();
    expect(box.getAttribute('spellcheck')).toBeNull();
  });

  it('shows a fill-in-the-blank exercise with its meaning', () => {
    renderMode({
      kind: 'fill_blank', source: 'Mám ____.', direction: 'en-sk',
      translation: 'I have water.', modelAnswer: 'vodu', keyPoints: [],
    });
    expect(screen.getByText('Fill in the missing word')).toBeTruthy();
    expect(screen.getByText('Mám ____.')).toBeTruthy();
    expect(screen.getByText('I have water.')).toBeTruthy();
    expect(screen.getByPlaceholderText('Type the missing word...')).toBeTruthy();
  });

  it('shows an error-correction exercise with its meaning', () => {
    renderMode({
      kind: 'error_correction', source: 'Mám voda.', direction: 'en-sk',
      translation: 'I have water.', modelAnswer: 'Mám vodu.', keyPoints: [],
    });
    expect(screen.getByText('Fix the mistake')).toBeTruthy();
    expect(screen.getByText('I have water.')).toBeTruthy();
    expect(screen.getByPlaceholderText('Type the corrected sentence...')).toBeTruthy();
  });

  it('shows no meaning line for a plain translation', () => {
    renderMode({ source: 'I have water.', direction: 'en-sk', modelAnswer: 'Mám vodu.', keyPoints: [] });
    expect(screen.queryByText(/^Meaning/)).toBeNull();
  });
});

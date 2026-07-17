import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import VocabMode from '../VocabMode';
import type { Session, VocabExerciseData, GrammarExerciseData } from '../../lib/types';

// Mock api so tests don't make real HTTP calls
vi.mock('../../lib/api', () => ({
  submitVocabAnswer: vi.fn(),
  endSession: vi.fn(),
  getSession: vi.fn(),
}));

// Mock sounds so they don't blow up in jsdom
vi.mock('../../lib/sounds', () => ({
  playCorrect: vi.fn(),
  playIncorrect: vi.fn(),
}));

// Mock framer-motion to avoid animation noise in tests
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  };
});

// Mock child components that aren't under test
vi.mock('../SessionHeader', () => ({
  default: () => null,
}));
vi.mock('../ProgressBar', () => ({
  default: () => null,
}));
vi.mock('../LoadingDots', () => ({
  default: () => null,
}));
vi.mock('../FeedbackView', () => ({
  default: () => null,
}));

function makeVocabSession(overrides: Partial<VocabExerciseData> = {}): Session {
  const exercises: VocabExerciseData = {
    type: 'vocabulary',
    questions: [
      { word: 'ďakujem', direction: 'sk-en', choices: ['thank you', 'please', 'goodbye', 'hello'], correctIndex: 0, explanation: '' },
      { word: 'prosím', direction: 'sk-en', choices: ['hello', 'please', 'goodbye', 'thank you'], correctIndex: 1, explanation: '' },
      { word: 'ahoj', direction: 'sk-en', choices: ['goodbye', 'please', 'hello', 'thank you'], correctIndex: 2, explanation: '' },
    ],
    currentIndex: 0,
    answers: [null, null, null],
    retryQueue: [],
    phase: 'questions',
    credits: [null, null, null],
    ...overrides,
  };
  return {
    id: 'test-session-1',
    user_id: 'user-1',
    mode: 'vocabulary',
    topic: 'greetings',
    difficulty: 'beginner',
    messages: [],
    completed: false,
    created_at: new Date().toISOString(),
    feedback: null,
    exercises,
  };
}

describe('VocabMode', () => {
  const noop = () => {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Bug fix #8: discriminant narrowing ---
  it('renders null when session.exercises type is not vocabulary', () => {
    const grammarExercises: GrammarExerciseData = {
      type: 'grammar',
      lesson: { concept: 'noun cases', explanation: 'test', examples: [] },
      exercises: [],
      currentIndex: 0,
      answers: [],
      correct: [],
      phase: 'lesson',
    };
    const session: Session = {
      id: 'test-session-2',
      user_id: 'user-1',
      mode: 'grammar',
      topic: 'grammar',
      difficulty: 'beginner',
      messages: [],
      completed: false,
      created_at: new Date().toISOString(),
      feedback: null,
      exercises: grammarExercises,
    };
    const { container } = render(
      <VocabMode session={session} setSession={noop} onEnd={noop} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders null when session.exercises is undefined', () => {
    const session: Session = {
      id: 'test-session-3',
      user_id: 'user-1',
      mode: 'vocabulary',
      topic: 'greetings',
      difficulty: 'beginner',
      messages: [],
      completed: false,
      created_at: new Date().toISOString(),
      feedback: null,
      exercises: undefined,
    };
    const { container } = render(
      <VocabMode session={session} setSession={noop} onEnd={noop} />
    );
    expect(container.firstChild).toBeNull();
  });

  // --- Active quiz renders ---
  it('renders the current word in the quiz', () => {
    const session = makeVocabSession({ currentIndex: 0 });
    render(<VocabMode session={session} setSession={noop} onEnd={noop} />);
    expect(screen.getByText('ďakujem')).toBeTruthy();
  });

  it('renders all 4 choice buttons', () => {
    const session = makeVocabSession({ currentIndex: 0 });
    render(<VocabMode session={session} setSession={noop} onEnd={noop} />);
    expect(screen.getByText('thank you')).toBeTruthy();
    expect(screen.getByText('please')).toBeTruthy();
    expect(screen.getByText('goodbye')).toBeTruthy();
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('renders direction label for sk-en question', () => {
    const session = makeVocabSession({ currentIndex: 0 });
    render(<VocabMode session={session} setSession={noop} onEnd={noop} />);
    expect(screen.getByText(/what does this mean in english/i)).toBeTruthy();
  });

  // --- Bug fix #7: retry-phase progress from answers state ---
  it('shows Retry round label in retry phase', () => {
    // In retry phase: questions answered so far = answers that are non-null in retryQueue positions
    // retryQueue = [1, 2], currentIndex = 1 (first retry question), answers for retry = [null, null]
    const session = makeVocabSession({
      phase: 'retry',
      retryQueue: [1, 2],
      currentIndex: 1,
      answers: [0, null, null], // q0 answered, q1 and q2 in retry
    });
    render(<VocabMode session={session} setSession={noop} onEnd={noop} />);
    expect(screen.getByText(/retry round/i)).toBeTruthy();
  });

  it('shows correct retry progress numerals in retry phase', () => {
    // retryQueue = [1, 2], currentIndex = 1 meaning we're on first retry question
    // answered = 0 retry questions done so far, total = 2
    const session = makeVocabSession({
      phase: 'retry',
      retryQueue: [1, 2],
      currentIndex: 1,
      answers: [0, null, null],
    });
    render(<VocabMode session={session} setSession={noop} onEnd={noop} />);
    // Should show "0 / 2" or "0/2" — the retry progress
    expect(screen.getByText(/0\s*\/\s*2/)).toBeTruthy();
  });

  it('shows incremented retry progress when one retry question answered', () => {
    // retryQueue = [1, 2], currentIndex = 2 (second retry question)
    // answered[1] is set meaning one retry question has been answered
    const session = makeVocabSession({
      phase: 'retry',
      retryQueue: [1, 2],
      currentIndex: 2,
      answers: [0, 1, null],
    });
    render(<VocabMode session={session} setSession={noop} onEnd={noop} />);
    // Should show "1 / 2"
    expect(screen.getByText(/1\s*\/\s*2/)).toBeTruthy();
  });

  // --- progress dots in questions phase ---
  it('shows progress label for questions phase', () => {
    const session = makeVocabSession({ currentIndex: 1, answers: [0, null, null] });
    render(<VocabMode session={session} setSession={noop} onEnd={noop} />);
    // Progress should show 1/3 (questions phase: currentIndex is 1, total is 3)
    expect(screen.getByText(/1\s*\/\s*3/)).toBeTruthy();
  });
});

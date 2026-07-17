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
// SessionHeader renders children so progress segments (passed as slot children) are visible in tests
vi.mock('../SessionHeader', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ children }: { children: any }) => children,
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
      <VocabMode session={session} setSession={noop} />
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
      <VocabMode session={session} setSession={noop} />
    );
    expect(container.firstChild).toBeNull();
  });

  // --- Active quiz renders ---
  it('renders the current word in the quiz', () => {
    const session = makeVocabSession({ currentIndex: 0 });
    render(<VocabMode session={session} setSession={noop} />);
    expect(screen.getByText('ďakujem')).toBeTruthy();
  });

  it('renders all 4 choice buttons', () => {
    const session = makeVocabSession({ currentIndex: 0 });
    render(<VocabMode session={session} setSession={noop} />);
    expect(screen.getByText('thank you')).toBeTruthy();
    expect(screen.getByText('please')).toBeTruthy();
    expect(screen.getByText('goodbye')).toBeTruthy();
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('renders direction label for sk-en question', () => {
    const session = makeVocabSession({ currentIndex: 0 });
    render(<VocabMode session={session} setSession={noop} />);
    expect(screen.getByText(/what does this mean in english/i)).toBeTruthy();
  });

  // --- Bug fix #7: retry-phase progress from answers state ---
  it('shows Retry round label in retry phase', () => {
    // Realistic fixture: all retry items have integer answers (backend stores wrong-choice integers).
    // retryQueue = [1, 2]: indices 1 and 2 are still in retry (wrong on first pass).
    // answers = [0, 3, 2]: q0 got correct (0), q1 got wrong (3), q2 got wrong (2) on first pass.
    const session = makeVocabSession({
      phase: 'retry',
      retryQueue: [1, 2],
      currentIndex: 1,
      answers: [0, 3, 2], // all answers are integers — no nulls during retry
    });
    render(<VocabMode session={session} setSession={noop} />);
    expect(screen.getByText(/retry round/i)).toBeTruthy();
  });

  it('shows "Retry round · 2 left" label at retry start with queue [1,2]', () => {
    // retryQueue has 2 items → "Retry round · 2 left"
    // answers = [0, 3, 2]: all integers, no nulls
    const session = makeVocabSession({
      phase: 'retry',
      retryQueue: [1, 2],
      currentIndex: 1,
      answers: [0, 3, 2],
    });
    render(<VocabMode session={session} setSession={noop} />);
    // Should show "Retry round · 2 left"
    expect(screen.getByText(/retry round\s*·\s*2\s*left/i)).toBeTruthy();
  });

  it('shows 1/3 progress segments at retry start (1 mastered out of 3 total)', () => {
    // questions.length = 3, retryQueue.length = 2 → filled = 3 - 2 = 1, total = 3
    // Progress bar should have 1 filled segment (green) and 2 unfilled out of 3 total segments
    const session = makeVocabSession({
      phase: 'retry',
      retryQueue: [1, 2],
      currentIndex: 1,
      answers: [0, 3, 2],
    });
    const { container } = render(<VocabMode session={session} setSession={noop} />);
    // jsdom converts hex to rgb; look for segments with green fill (rgb(93, 228, 165))
    const filled = Array.from(container.querySelectorAll('div')).filter(
      el => el.getAttribute('style')?.includes('rgb(93, 228, 165)')
    );
    expect(filled.length).toBe(1);
  });

  it('shows "Retry round · 1 left" after one recovery (queue [2], answers [0, 1, 2])', () => {
    // After q1 answered correctly in retry: queue shrinks to [2], answers[1] becomes correct int
    // answers = [0, 1, 2]: all integers
    const session = makeVocabSession({
      phase: 'retry',
      retryQueue: [2],
      currentIndex: 2,
      answers: [0, 1, 2],
    });
    render(<VocabMode session={session} setSession={noop} />);
    expect(screen.getByText(/retry round\s*·\s*1\s*left/i)).toBeTruthy();
  });

  it('shows 2/3 progress segments after one recovery (2 mastered out of 3 total)', () => {
    // questions.length = 3, retryQueue.length = 1 → filled = 3 - 1 = 2, total = 3
    const session = makeVocabSession({
      phase: 'retry',
      retryQueue: [2],
      currentIndex: 2,
      answers: [0, 1, 2],
    });
    const { container } = render(<VocabMode session={session} setSession={noop} />);
    // jsdom converts hex to rgb; look for segments with green fill (rgb(93, 228, 165))
    const filled = Array.from(container.querySelectorAll('div')).filter(
      el => el.getAttribute('style')?.includes('rgb(93, 228, 165)')
    );
    expect(filled.length).toBe(2);
  });

  // --- progress dots in questions phase ---
  it('shows progress label for questions phase', () => {
    const session = makeVocabSession({ currentIndex: 1, answers: [0, null, null] });
    render(<VocabMode session={session} setSession={noop} />);
    // Progress should show 1/3 (questions phase: currentIndex is 1, total is 3)
    expect(screen.getByText(/1\s*\/\s*3/)).toBeTruthy();
  });

  // --- Fix 2: pronunciation pill ---
  it('renders no pronunciation pill when question has no pronunciation field', () => {
    // question without pronunciation: pill must be absent
    const session = makeVocabSession({
      questions: [
        { word: 'voda', direction: 'sk-en', choices: ['water', 'fire', 'air', 'earth'], correctIndex: 0, explanation: '' },
        { word: 'oheň', direction: 'sk-en', choices: ['fire', 'water', 'air', 'earth'], correctIndex: 0, explanation: '' },
        { word: 'vzduch', direction: 'sk-en', choices: ['air', 'fire', 'water', 'earth'], correctIndex: 0, explanation: '' },
      ],
      currentIndex: 0,
      answers: [null, null, null],
    });
    render(<VocabMode session={session} setSession={noop} />);
    // The fabricated pronunciation (e.g. "V-O-D-A" or any Volume2 icon pill) should not be present
    const pills = document.querySelectorAll('svg[data-lucide="volume-2"], [data-testid="pronunciation-pill"]');
    expect(pills.length).toBe(0);
    // Also confirm the fabricated text is absent
    expect(screen.queryByText(/V-O-D-A/)).toBeNull();
  });

  it('renders pronunciation pill with text when question has pronunciation field', () => {
    const session = makeVocabSession({
      questions: [
        { word: 'voda', direction: 'sk-en', choices: ['water', 'fire', 'air', 'earth'], correctIndex: 0, explanation: '', pronunciation: 'VOH-dah' },
        { word: 'oheň', direction: 'sk-en', choices: ['fire', 'water', 'air', 'earth'], correctIndex: 0, explanation: '' },
        { word: 'vzduch', direction: 'sk-en', choices: ['air', 'fire', 'water', 'earth'], correctIndex: 0, explanation: '' },
      ],
      currentIndex: 0,
      answers: [null, null, null],
    });
    render(<VocabMode session={session} setSession={noop} />);
    // The pill should show "/VOH-dah/"
    expect(screen.getByText('/VOH-dah/')).toBeTruthy();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import VocabMode from '../VocabMode';
import * as api from '../../lib/api';
import { ADVANCE_AFTER_CORRECT_MS } from '../../lib/pacing';
import { installFakeSpeech, type FakeSpeech } from '../../test/fakeSpeech';
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

// Tests flip this to see the screen as a learner who prefers reduced motion does.
const motionPrefs = vi.hoisted(() => ({ reduced: false }));

// Mock framer-motion to avoid animation noise in tests. Each element's
// transition is exposed as data-transition so tests can read its duration.
vi.mock('framer-motion', async () => {
  const React = await import('react');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const motion = new Proxy({} as any, {
    get: (_target: unknown, tag: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return React.forwardRef(({ children, transition, ...props }: any, ref: any) => {
        const dataTransition = transition ? JSON.stringify(transition) : undefined;
        return React.createElement(tag, { ...props, 'data-transition': dataTransition, ref }, children);
      });
    },
  });
  return {
    motion,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    useReducedMotion: () => motionPrefs.reduced,
  };
});

// Mock child components that aren't under test
// SessionHeader renders its slots so progress segments and the streak badge are visible in tests
vi.mock('../SessionHeader', async () => {
  const React = await import('react');
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    default: ({ children, progress }: { children: any; progress?: any }) =>
      React.createElement(React.Fragment, null, children, progress),
  };
});
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
    motionPrefs.reduced = false;
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

  it('shows one visible progress segment per question, filled for answered ones', () => {
    const questions = Array.from({ length: 10 }, (_, i) => ({
      word: `slovo${i}`, direction: 'sk-en' as const,
      choices: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: '',
    }));
    const session = makeVocabSession({
      questions,
      currentIndex: 4,
      answers: [0, 0, 0, 0, null, null, null, null, null, null],
      credits: Array(10).fill(null),
    });
    render(<VocabMode session={session} setSession={noop} />);
    const segments = screen.getAllByTestId('progress-segment');
    expect(segments).toHaveLength(10);
    // jsdom does not compute layout: the row is a 10-column grid, so each segment gets a share of its width.
    expect(segments[0].parentElement!.style.gridTemplateColumns).toBe('repeat(10, minmax(0, 1fr))');
    expect(segments.filter(s => s.dataset.filled === 'true')).toHaveLength(4);
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

  it('labels a question that is a review word', () => {
    const session = makeVocabSession({
      questions: [
        { word: 'hrad', direction: 'sk-en', choices: ['castle', 'house', 'shop', 'road'],
          correctIndex: 0, explanation: '', review: true },
      ],
      answers: [null],
      credits: [null],
    });
    render(<VocabMode session={session} setSession={() => {}} />);
    expect(screen.getByText('Review')).toBeTruthy();
  });

  it('shows no review label on a new word', () => {
    const session = makeVocabSession();
    render(<VocabMode session={session} setSession={() => {}} />);
    expect(screen.queryByText('Review')).toBeNull();
  });

  // --- An answer names the question it was for ---
  it('sends the index of the question being answered', async () => {
    const session = makeVocabSession({ currentIndex: 1, answers: [0, null, null] });
    vi.mocked(api.submitVocabAnswer).mockResolvedValue(session);
    render(<VocabMode session={session} setSession={noop} />);
    fireEvent.click(screen.getByText('please'));
    await waitFor(() => {
      expect(api.submitVocabAnswer).toHaveBeenCalledWith('test-session-1', 1, 1);
    });
  });

  it('refetches the session and shows no error when the answer was stale', async () => {
    const session = makeVocabSession({ currentIndex: 0 });
    const fresh = makeVocabSession({ currentIndex: 1, answers: [0, null, null] });
    vi.mocked(api.submitVocabAnswer).mockRejectedValue(
      new Error('{"detail":"That question was already answered.","code":"stale_answer"}'),
    );
    vi.mocked(api.getSession).mockResolvedValue(fresh);
    const setSession = vi.fn();
    render(<VocabMode session={session} setSession={setSession} />);
    fireEvent.click(screen.getByText('thank you'));

    await waitFor(() => {
      expect(setSession).toHaveBeenCalledWith(fresh);
    });
    expect(api.getSession).toHaveBeenCalledWith('test-session-1');
    expect(screen.queryByText(/not saved/i)).toBeNull();
    expect(screen.queryByText(/already answered/i)).toBeNull();
  });

  // --- Reduced motion: the result panel appears without moving ---
  it('shows the result panel with no animation when reduced motion is on', async () => {
    motionPrefs.reduced = true;
    const session = makeVocabSession({ currentIndex: 0 });
    vi.mocked(api.submitVocabAnswer).mockResolvedValue(session);
    render(<VocabMode session={session} setSession={noop} />);
    fireEvent.click(screen.getByText('thank you'));

    const panel = (await screen.findByText('Správne!')).closest('[data-transition]') as HTMLElement;
    // The nearest animated ancestor of the heading is the panel itself.
    expect(JSON.parse(panel.dataset.transition!).duration).toBe(0);
  });

  it('slides the result panel in when reduced motion is off', async () => {
    const session = makeVocabSession({ currentIndex: 0 });
    vi.mocked(api.submitVocabAnswer).mockResolvedValue(session);
    render(<VocabMode session={session} setSession={noop} />);
    fireEvent.click(screen.getByText('thank you'));

    const panel = (await screen.findByText('Správne!')).closest('[data-transition]') as HTMLElement;
    expect(JSON.parse(panel.dataset.transition!).duration).toBeGreaterThan(0);
  });

  // --- Spoken pronunciation ---
  describe('spoken pronunciation', () => {
    let fake: FakeSpeech | null = null;
    const slovakVoice = { name: 'Laura', lang: 'sk-SK' };

    afterEach(() => {
      fake?.uninstall();
      fake = null;
    });

    function skEnSession(): Session {
      return makeVocabSession({
        questions: [
          { word: 'voda', direction: 'sk-en', choices: ['water', 'fire', 'air', 'earth'], correctIndex: 0, explanation: '', pronunciation: 'VOH-dah' },
        ],
        answers: [null],
        credits: [null],
      });
    }

    function enSkSession(): Session {
      return makeVocabSession({
        questions: [
          { word: 'water', direction: 'en-sk', choices: ['oheň', 'voda', 'vzduch', 'zem'], correctIndex: 1, explanation: '', pronunciation: 'VOH-dah' },
        ],
        answers: [null],
        credits: [null],
      });
    }

    function spokenTexts(): string[] {
      return fake!.synth.speak.mock.calls.map(call => call[0].text);
    }

    it('shows a button that speaks the Slovak word when speech is available', () => {
      fake = installFakeSpeech([slovakVoice]);
      render(<VocabMode session={skEnSession()} setSession={noop} />);
      const button = screen.getByRole('button', { name: /hear voda/i });
      expect(button.textContent).toContain('/VOH-dah/');
      fireEvent.click(button);
      expect(spokenTexts()).toEqual(['voda']);
      expect(fake.synth.speak.mock.calls[0][0].lang).toBe('sk-SK');
    });

    it('gives the button a tap target at least 44px tall', () => {
      fake = installFakeSpeech([slovakVoice]);
      render(<VocabMode session={skEnSession()} setSession={noop} />);
      const button = screen.getByRole('button', { name: /hear voda/i });
      expect(parseInt(button.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    });

    it('shows the phonetic text with no button and no speaker icon when speech is not available', () => {
      render(<VocabMode session={skEnSession()} setSession={noop} />);
      expect(screen.queryByRole('button', { name: /hear/i })).toBeNull();
      const pill = screen.getByText('/VOH-dah/').parentElement!;
      expect(pill.tagName).not.toBe('BUTTON');
      expect(pill.querySelector('svg')).toBeNull();
    });

    it('shows no button when the phone has voices but none of them Slovak', () => {
      fake = installFakeSpeech([{ name: 'Samantha', lang: 'en-US' }]);
      render(<VocabMode session={skEnSession()} setSession={noop} />);
      expect(screen.queryByRole('button', { name: /hear/i })).toBeNull();
      expect(screen.getByText('/VOH-dah/')).toBeTruthy();
    });

    it('turns the pill into a button when a Slovak voice arrives late', () => {
      fake = installFakeSpeech([]);
      render(<VocabMode session={skEnSession()} setSession={noop} />);
      expect(screen.queryByRole('button', { name: /hear voda/i })).toBeNull();
      act(() => fake!.setVoices([slovakVoice]));
      expect(screen.getByRole('button', { name: /hear voda/i })).toBeTruthy();
    });

    it('on an English question, offers no button until the learner answers, then speaks the correct answer', async () => {
      fake = installFakeSpeech([slovakVoice]);
      const session = enSkSession();
      vi.mocked(api.submitVocabAnswer).mockResolvedValue(session);
      render(<VocabMode session={session} setSession={noop} />);
      expect(screen.queryByRole('button', { name: /hear/i })).toBeNull();
      // The phonetic hint would give the answer away too.
      expect(screen.queryByText('/VOH-dah/')).toBeNull();

      fireEvent.click(screen.getByText('oheň'));
      // Let the mocked server acknowledgement resolve before tapping.
      await act(async () => {});
      fireEvent.click(screen.getByRole('button', { name: /hear voda/i }));
      expect(spokenTexts()).toEqual(['voda']);
    });

    it('stops speaking when the learner leaves the lesson', () => {
      fake = installFakeSpeech([slovakVoice]);
      const { unmount } = render(<VocabMode session={skEnSession()} setSession={noop} />);
      fake.synth.cancel.mockClear();
      unmount();
      expect(fake.synth.cancel).toHaveBeenCalled();
    });

    it('stops speaking when the lesson moves to another question', () => {
      fake = installFakeSpeech([slovakVoice]);
      const first = makeVocabSession({ currentIndex: 0 });
      const { rerender } = render(<VocabMode session={first} setSession={noop} />);
      fake.synth.cancel.mockClear();
      rerender(<VocabMode session={makeVocabSession({ currentIndex: 1, answers: [0, null, null] })} setSession={noop} />);
      expect(fake.synth.cancel).toHaveBeenCalled();
    });
  });

  // --- Pacing: a correct answer moves on quickly ---
  describe('after a correct answer', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    function Harness({ initial }: { initial: Session }) {
      const [current, setCurrent] = useState(initial);
      return <VocabMode session={current} setSession={setCurrent} />;
    }

    it('shows the next question once ADVANCE_AFTER_CORRECT_MS has passed, and not before', async () => {
      const session = makeVocabSession({ currentIndex: 0 });
      const next = makeVocabSession({ currentIndex: 1, answers: [0, null, null] });
      vi.mocked(api.submitVocabAnswer).mockResolvedValue(next);
      render(<Harness initial={session} />);

      fireEvent.click(screen.getByText('thank you'));
      // Let the mocked server acknowledgement resolve; the advance timer starts then.
      await act(async () => {});

      act(() => {
        vi.advanceTimersByTime(ADVANCE_AFTER_CORRECT_MS - 1);
      });
      expect(screen.getByText('ďakujem')).toBeTruthy();
      expect(screen.queryByText('prosím')).toBeNull();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByText('prosím')).toBeTruthy();
      expect(screen.queryByText('ďakujem')).toBeNull();
    });
  });
});

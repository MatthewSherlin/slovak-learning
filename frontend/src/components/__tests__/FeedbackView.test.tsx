import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import FeedbackView from '../FeedbackView';
import type { GrammarExerciseData, Session, SessionFeedback, VocabExerciseData } from '../../lib/types';

// Mock useNavigate so tests don't need a Router
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
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
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useReducedMotion: () => false,
  };
});

const MEMO = '\u{1F4DD}';

const baseSession: Session = {
  id: 's1',
  user_id: 'u1',
  mode: 'vocabulary',
  topic: 'greetings_basics',
  difficulty: 'beginner',
  messages: [],
  completed: true,
  created_at: '2026-07-16T10:00:00Z',
  feedback: null,
  exercises: {
    type: 'vocabulary',
    questions: [
      { word: 'chlieb', direction: 'sk-en', choices: ['bread', 'milk', 'meat', 'fish'], correctIndex: 0, explanation: '' },
      { word: 'water', direction: 'en-sk', choices: ['mlieko', 'voda', 'pivo', 'čaj'], correctIndex: 1, explanation: '' },
      { word: 'mäso', direction: 'sk-en', choices: ['fish', 'meat', 'milk', 'pork'], correctIndex: 1, explanation: '' },
      { word: 'syr', direction: 'sk-en', choices: ['cheese', 'milk', 'meat', 'fish'], correctIndex: 0, explanation: '' },
    ],
    currentIndex: 4,
    answers: [0, 1, 1, null],
    credits: [1, 0.5, 0, null],
    retryQueue: [],
    phase: 'complete',
  },
};

// A lesson from before exercises existed.
const legacySession: Session = { ...baseSession, exercises: undefined };

const makeFeedback = (
  overall_score: number | null,
  scores: SessionFeedback['scores'] = [],
): SessionFeedback => ({
  overall_score,
  scores,
  strengths: [],
  improvements: [],
  sample_answer: '',
  vocabulary_learned: [],
  grammar_notes: [],
});

// What the backend sent before this change: text written by a model.
const olderFeedback = (overall_score: number): SessionFeedback => ({
  ...makeFeedback(overall_score),
  strengths: ['Great recall of food words'],
  improvements: ['Practise the accusative'],
  sample_answer: 'Chcem chlieb, prosím.',
  vocabulary_learned: [{ slovak: 'ďakujem', english: 'thank you', example: 'Ďakujem pekne.' }],
  grammar_notes: ['Accusative after chcieť'],
});

const grammarSession: Session = {
  ...baseSession,
  mode: 'grammar',
  exercises: {
    type: 'grammar',
    lesson: { concept: 'Accusative', explanation: '', examples: [] },
    exercises: [
      { sentence: 'Vidím ____.', blank: 'dom', explanation: '' },
      { sentence: 'Pijem ____ každý deň.', blank: 'kávu', explanation: '' },
      { sentence: 'Mám ____.', blank: 'knihu', explanation: '' },
      { sentence: 'Čítam ____.', blank: 'noviny', explanation: '' },
    ],
    currentIndex: 3,
    answers: ['dom', 'kavu', 'knihy', null],
    correct: [true, true, false, null],
    credits: [1, 1, 0, null],
    tiers: ['exact', 'accent', 'wrong', null],
    phase: 'complete',
  },
};

const translationSession: Session = {
  ...baseSession,
  mode: 'translation',
  exercises: {
    type: 'translation',
    exercises: [
      { kind: 'translate', source: 'I want bread', direction: 'en-sk', modelAnswer: 'Chcem chlieb', keyPoints: [] },
      { kind: 'translate', source: 'Water, please', direction: 'en-sk', modelAnswer: 'Vodu, prosím', keyPoints: [] },
      { kind: 'translate', source: 'Good night', direction: 'en-sk', modelAnswer: 'Dobrú noc', keyPoints: [] },
    ],
    currentIndex: 2,
    answers: [
      { userAnswer: 'Chcem chlieb', score: 10, feedback: '', tier: 'exact' },
      { userAnswer: 'Voda prosim', score: 6, feedback: 'Use the accusative.' },
      null,
    ],
    phase: 'exercises',
  },
};

const conversationSession: Session = {
  ...baseSession,
  mode: 'conversation',
  topic: 'shopping',
  messages: [
    { role: 'tutor', content: 'Dobrý deň! Čo si želáte?' },
    { role: 'student', content: 'Chcem kúpiť chlieb.' },
    { role: 'tutor', content: `Nech sa páči.\n${MEMO} chcem kupit chleba → chcem kúpiť chlieb` },
    { role: 'student', content: 'Ďakujem.' },
    { role: 'system', content: `${MEMO} not a tutor line` },
  ],
  exercises: {
    type: 'conversation',
    exchangeCount: 2,
    maxExchanges: 10,
    phase: 'active',
  },
};

describe('FeedbackView', () => {
  describe('category breakdown bars', () => {
    it('renders a bar row for each score entry', () => {
      const feedback = {
        ...makeFeedback(7, [
          { category: 'Word recognition', score: 8, comment: 'Great job.' },
          { category: 'Diacritics', score: 5, comment: 'Review long vowels.' },
        ]),
        items_answered: 3,
      };

      render(<FeedbackView session={baseSession} feedback={feedback} />);

      expect(screen.getByText('Word recognition')).toBeTruthy();
      expect(screen.getByText('Diacritics')).toBeTruthy();
      expect(screen.getByText('Great job.')).toBeTruthy();
      expect(screen.getByText('Review long vowels.')).toBeTruthy();
    });

    it('hides the breakdown section when scores is empty', () => {
      const feedback = makeFeedback(7, []);
      render(<FeedbackView session={baseSession} feedback={feedback} />);
      expect(screen.queryByText('Breakdown')).toBeNull();
    });
  });

  describe('encouragement thresholds', () => {
    it('shows Výborne! for score >= 9', () => {
      render(<FeedbackView session={baseSession} feedback={makeFeedback(9)} />);
      expect(screen.getByText('Výborne!')).toBeTruthy();
    });

    it('shows Dobre! for score == 7', () => {
      render(<FeedbackView session={baseSession} feedback={makeFeedback(7)} />);
      expect(screen.getByText('Dobre!')).toBeTruthy();
    });

    it('shows Pokračuj! for score == 5', () => {
      render(<FeedbackView session={baseSession} feedback={makeFeedback(5)} />);
      expect(screen.getByText('Pokračuj!')).toBeTruthy();
    });

    it('shows Skús znova! for score < 5', () => {
      render(<FeedbackView session={baseSession} feedback={makeFeedback(3)} />);
      expect(screen.getByText('Skús znova!')).toBeTruthy();
    });
  });

  describe('score display', () => {
    it('shows "out of 10" label', () => {
      render(<FeedbackView session={baseSession} feedback={makeFeedback(7)} />);
      expect(screen.getByText('out of 10')).toBeTruthy();
    });

    it('renders the numeric score', () => {
      render(<FeedbackView session={baseSession} feedback={makeFeedback(7)} />);
      expect(screen.getByText('7')).toBeTruthy();
    });
  });

  describe('chips', () => {
    it('renders mode, topic, and difficulty chips', () => {
      render(<FeedbackView session={baseSession} feedback={makeFeedback(7)} />);
      expect(screen.getByText('Vocabulary')).toBeTruthy();
      expect(screen.getByText('Greetings Basics')).toBeTruthy();
      expect(screen.getByText('Beginner')).toBeTruthy();
    });
  });

  describe('vocabulary answers', () => {
    it('shows each answered word with its meaning and how the first attempt went', () => {
      render(<FeedbackView session={baseSession} feedback={makeFeedback(5)} />);
      expect(screen.getByText('Your answers')).toBeTruthy();
      expect(screen.getByText('chlieb')).toBeTruthy();
      expect(screen.getByText('bread')).toBeTruthy();
      expect(screen.getByText('voda')).toBeTruthy();
      expect(screen.getByText('water')).toBeTruthy();
      expect(screen.getByText('mäso')).toBeTruthy();
      expect(screen.getByText('First try')).toBeTruthy();
      expect(screen.getByText('On retry')).toBeTruthy();
      expect(screen.getByText('Missed')).toBeTruthy();
    });

    it('leaves out a question that was never answered', () => {
      render(<FeedbackView session={baseSession} feedback={makeFeedback(5)} />);
      expect(screen.queryByText('syr')).toBeNull();
    });

    it('labels rows Right or Wrong, not First try or Missed, when the lesson has no stored credits', () => {
      const ex = baseSession.exercises as VocabExerciseData;
      const session: Session = {
        ...baseSession,
        exercises: { ...ex, answers: [0, 0, 1, null], credits: undefined },
      };
      render(<FeedbackView session={session} feedback={makeFeedback(5)} />);
      expect(screen.getAllByText('Right')).toHaveLength(2);
      expect(screen.getByText('Wrong')).toBeTruthy();
      expect(screen.queryByText('First try')).toBeNull();
      expect(screen.queryByText('On retry')).toBeNull();
      expect(screen.queryByText('Missed')).toBeNull();
    });
  });

  describe('grammar answers', () => {
    it('shows each sentence completed, what was typed, and right or wrong', () => {
      render(<FeedbackView session={grammarSession} feedback={makeFeedback(5)} />);
      expect(screen.getByText('Vidím dom.')).toBeTruthy();
      expect(screen.getByText('You typed: dom')).toBeTruthy();
      expect(screen.getByText('Mám knihu.')).toBeTruthy();
      expect(screen.getByText('You typed: knihy')).toBeTruthy();
      expect(screen.getByText('Wrong')).toBeTruthy();
      expect(screen.queryByText('Čítam noviny.')).toBeNull();
    });

    it('shows an answer right but for its accents as right, with nothing else', () => {
      render(<FeedbackView session={grammarSession} feedback={makeFeedback(5)} />);
      const row = screen.getByText('Pijem kávu každý deň.').closest('div')!.parentElement!;
      expect(row.textContent).toBe('Pijem kávu každý deň.You typed: kavuRight');
      expect(screen.getAllByText('Right')).toHaveLength(2);
    });

    it('shows an accent-only answer as Right even when its stored credit is partial (regression: the 0.8-credit shape stored 17 Jul-28 Sep)', () => {
      const ex = grammarSession.exercises as GrammarExerciseData;
      const session: Session = {
        ...grammarSession,
        exercises: {
          ...ex,
          exercises: [{ sentence: 'Vidím ____.', blank: 'dom', explanation: '' }],
          currentIndex: 1,
          answers: ['dom'],
          correct: [true],
          credits: [0.8],
          tiers: ['accent'],
        },
      };
      render(<FeedbackView session={session} feedback={makeFeedback(5)} />);
      expect(screen.getByText('Right')).toBeTruthy();
      expect(screen.queryByText('Wrong')).toBeNull();
    });
  });

  describe('translation answers', () => {
    it('shows source, what was typed, the model answer and the score of each answered exercise', () => {
      render(<FeedbackView session={translationSession} feedback={makeFeedback(5.3)} />);
      expect(screen.getByText('I want bread')).toBeTruthy();
      expect(screen.getByText('You typed: Chcem chlieb')).toBeTruthy();
      expect(screen.getByText('Model answer: Chcem chlieb')).toBeTruthy();
      expect(screen.getByText('10/10')).toBeTruthy();
      expect(screen.getByText('Water, please')).toBeTruthy();
      expect(screen.getByText('You typed: Voda prosim')).toBeTruthy();
      expect(screen.getByText('Model answer: Vodu, prosím')).toBeTruthy();
      expect(screen.getByText('6/10')).toBeTruthy();
    });

    it('leaves out exercises the learner did not reach', () => {
      render(<FeedbackView session={translationSession} feedback={makeFeedback(5.3)} />);
      expect(screen.queryByText('Good night')).toBeNull();
    });
  });

  describe('conversation', () => {
    it('shows messages sent out of the maximum, with no ring or breakdown', () => {
      render(<FeedbackView session={conversationSession} feedback={makeFeedback(null)} />);
      expect(screen.queryByText('out of 10')).toBeNull();
      expect(screen.queryByText('Breakdown')).toBeNull();
      expect(screen.getByText('2')).toBeTruthy();
      expect(screen.getByText('of 10 messages sent')).toBeTruthy();
    });

    it('shows the corrections stored on the feedback', () => {
      const feedback = { ...makeFeedback(null), corrections: ['chcem kupit chleba → chcem kúpiť chlieb'] };
      render(<FeedbackView session={conversationSession} feedback={feedback} />);
      expect(screen.getByText('Corrections')).toBeTruthy();
      expect(screen.getByText('chcem kupit chleba → chcem kúpiť chlieb')).toBeTruthy();
    });

    it('shows no corrections card for an older conversation, even though its messages hold an accent correction', () => {
      // conversationSession's messages contain a tutor line starting with the
      // memo emoji about missing diacritics; feedback with no `corrections`
      // (the shape stored before the tutor learned to drop those lines) must
      // not have that line parsed back out and shown as a mistake.
      render(<FeedbackView session={conversationSession} feedback={makeFeedback(null)} />);
      expect(screen.queryByText('Corrections')).toBeNull();
      expect(screen.queryByText(/chcem kupit chleba/)).toBeNull();
    });

    it('shows no ring for an older conversation that has a stored score', () => {
      const feedback = {
        ...olderFeedback(7),
        scores: [{ category: 'Fluency', score: 7, comment: 'ok' }],
      };
      render(<FeedbackView session={conversationSession} feedback={feedback} />);
      expect(screen.queryByText('out of 10')).toBeNull();
      expect(screen.queryByText('Fluency')).toBeNull();
      expect(screen.getByText('of 10 messages sent')).toBeTruthy();
    });

    it('shows no corrections list when the feedback has an empty list', () => {
      const feedback = { ...makeFeedback(null), corrections: [] };
      render(<FeedbackView session={conversationSession} feedback={feedback} />);
      expect(screen.queryByText('Corrections')).toBeNull();
      expect(screen.getByText('2')).toBeTruthy();
    });
  });

  describe('safe area', () => {
    it('adds the top safe-area inset to the page padding, since the route has no header', () => {
      const { container } = render(<FeedbackView session={baseSession} feedback={makeFeedback(7)} />);
      const page = container.querySelector('.px-5') as HTMLElement;
      expect(page.style.paddingTop).toContain('env(safe-area-inset-top)');
      expect(page.style.paddingTop).toContain('2.5rem');
    });
  });

  describe('a null score', () => {
    it('renders without a ring or encouragement', () => {
      render(<FeedbackView session={baseSession} feedback={makeFeedback(null)} />);
      expect(screen.queryByText('out of 10')).toBeNull();
      expect(screen.queryByText('Skús znova!')).toBeNull();
      expect(screen.getByText('Vocabulary')).toBeTruthy();
      expect(screen.getByText('chlieb')).toBeTruthy();
    });
  });

  describe('older lessons', () => {
    it('ignores the text a model wrote and shows the answers instead', () => {
      render(<FeedbackView session={baseSession} feedback={olderFeedback(7)} />);
      expect(screen.queryByText('Great recall of food words')).toBeNull();
      expect(screen.queryByText('Practise the accusative')).toBeNull();
      expect(screen.queryByText('Chcem chlieb, prosím.')).toBeNull();
      expect(screen.queryByText('ďakujem')).toBeNull();
      expect(screen.queryByText('Accusative after chcieť')).toBeNull();
      expect(screen.getByText('chlieb')).toBeTruthy();
      expect(screen.getByText('Dobre!')).toBeTruthy();
    });

    it('shows the score card alone for a lesson from before exercises existed', () => {
      const feedback = {
        ...olderFeedback(8),
        scores: [{ category: 'Retention', score: 8, comment: 'Good' }],
      };
      render(<FeedbackView session={legacySession} feedback={feedback} />);
      expect(screen.getByText('out of 10')).toBeTruthy();
      expect(screen.getByText('Dobre!')).toBeTruthy();
      expect(screen.queryByText('Breakdown')).toBeNull();
      expect(screen.queryByText('Your answers')).toBeNull();
      expect(screen.queryByText('Great recall of food words')).toBeNull();
    });
  });

  describe('breakdown of a lesson ended before results were counted', () => {
    it('drops a category the code does not compute for this lesson type, keeps one it does', () => {
      const feedback = makeFeedback(6, [
        { category: 'Diacritics & Spelling', score: 4, comment: 'You keep missing the accents on á and é.' },
        { category: 'Word recognition (SK→EN)', score: 8, comment: '' },
      ]);
      render(<FeedbackView session={baseSession} feedback={feedback} />);
      expect(screen.queryByText('Diacritics & Spelling')).toBeNull();
      expect(screen.queryByText(/missing the accents/)).toBeNull();
      expect(screen.getByText('Breakdown')).toBeTruthy();
      expect(screen.getByText('Word recognition (SK→EN)')).toBeTruthy();
    });

    it('drops a category whose name is computed for this lesson type but whose comment is AI-written', () => {
      // A model can write a category named the same as a computed one — its
      // comment gives it away, since the code itself never writes prose there.
      const feedback = makeFeedback(6, [
        { category: 'Recall (EN→SK)', score: 8, comment: 'Strong recall of food words.' },
      ]);
      render(<FeedbackView session={baseSession} feedback={feedback} />);
      expect(screen.queryByText('Breakdown')).toBeNull();
      expect(screen.queryByText('Strong recall of food words.')).toBeNull();
    });

    it('shows no breakdown when no computed category is left', () => {
      const feedback = makeFeedback(6, [{ category: 'Fluency', score: 6, comment: 'ok' }]);
      render(<FeedbackView session={baseSession} feedback={feedback} />);
      expect(screen.queryByText('Breakdown')).toBeNull();
    });

    it('drops an AI-written "Accuracy" row on an older translation lesson (shape f268ee7f9b27)', () => {
      const feedback = makeFeedback(4, [
        { category: 'Accuracy', score: 3, comment: 'Missing diacritics (\'mam\' instead of \'Mám\').' },
        { category: 'Grammar Application', score: 3, comment: 'Watch the case endings.' },
        { category: 'Diacritics & Spelling', score: 2, comment: 'Several missing háčky.' },
        { category: 'Vocabulary Recognition', score: 5, comment: 'Good range of words.' },
      ]);
      render(<FeedbackView session={translationSession} feedback={feedback} />);
      expect(screen.queryByText('Breakdown')).toBeNull();
      expect(screen.queryByText('Accuracy')).toBeNull();
    });

    it('drops an AI-written "Accuracy" row on an older grammar lesson', () => {
      const feedback = makeFeedback(4, [
        { category: 'Accuracy', score: 3, comment: 'Watch the accusative case.' },
      ]);
      render(<FeedbackView session={grammarSession} feedback={feedback} />);
      expect(screen.queryByText('Breakdown')).toBeNull();
    });

    it('keeps the comment of a new lesson', () => {
      const feedback = {
        ...makeFeedback(6, [{ category: 'Retry recovery', score: 5, comment: 'Recovered 1 of 2 missed word(s) on retry.' }]),
        items_answered: 3,
      };
      render(<FeedbackView session={baseSession} feedback={feedback} />);
      expect(screen.getByText('Recovered 1 of 2 missed word(s) on retry.')).toBeTruthy();
    });
  });

  describe('grammar lesson begun before credits existed', () => {
    it('judges items without a credit by whether they were right', () => {
      const ex = grammarSession.exercises as GrammarExerciseData;
      const exercises = Array.from({ length: 10 }, (_, i) => ({ sentence: `Veta ${i} ____.`, blank: `slovo${i}`, explanation: '' }));
      const session: Session = {
        ...grammarSession,
        exercises: {
          ...ex,
          exercises,
          currentIndex: 10,
          answers: exercises.map((e) => e.blank),
          correct: [true, false, true, false, true, false, false, true, false, true],
          credits: [null, null, null, null, null, null, null, 1, 0, 1],
          tiers: undefined,
        },
      };
      render(<FeedbackView session={session} feedback={makeFeedback(5)} />);
      expect(screen.getAllByText('Right')).toHaveLength(5);
      expect(screen.getAllByText('Wrong')).toHaveLength(5);
    });
  });

  describe('answered count', () => {
    it('says how many were answered when the lesson ended early', () => {
      render(<FeedbackView session={baseSession} feedback={makeFeedback(5)} />);
      expect(screen.getByText('3 of 4 answered')).toBeTruthy();
    });

    it('says it for grammar and translation too', () => {
      const { unmount } = render(<FeedbackView session={grammarSession} feedback={makeFeedback(5)} />);
      expect(screen.getByText('3 of 4 answered')).toBeTruthy();
      unmount();
      render(<FeedbackView session={translationSession} feedback={makeFeedback(5)} />);
      expect(screen.getByText('2 of 3 answered')).toBeTruthy();
    });

    it('says nothing when everything was answered', () => {
      const ex = baseSession.exercises as VocabExerciseData;
      const session: Session = { ...baseSession, exercises: { ...ex, answers: [0, 1, 1, 0], credits: [1, 0.5, 0, 1] } };
      render(<FeedbackView session={session} feedback={makeFeedback(6)} />);
      expect(screen.queryByText(/answered$/)).toBeNull();
    });

    it('is not shown for a conversation', () => {
      render(<FeedbackView session={conversationSession} feedback={makeFeedback(null)} />);
      expect(screen.queryByText(/answered$/)).toBeNull();
    });
  });
});

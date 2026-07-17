import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import FeedbackView from '../FeedbackView';
import type { Session, SessionFeedback } from '../../lib/types';

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
  };
});

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
};

const makeFeedback = (
  overall_score: number,
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

describe('FeedbackView', () => {
  describe('category breakdown bars', () => {
    it('renders a bar row for each score entry', () => {
      const feedback = makeFeedback(7, [
        { category: 'Word recognition', score: 8, comment: 'Great job.' },
        { category: 'Diacritics', score: 5, comment: 'Review long vowels.' },
      ]);

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

  describe('vocabulary learned', () => {
    it('renders vocab entries when present', () => {
      const feedback: SessionFeedback = {
        ...makeFeedback(8),
        vocabulary_learned: [
          { slovak: 'ďakujem', english: 'thank you', example: null },
        ],
      };
      render(<FeedbackView session={baseSession} feedback={feedback} />);
      expect(screen.getByText('ďakujem')).toBeTruthy();
      expect(screen.getByText('thank you')).toBeTruthy();
    });
  });
});

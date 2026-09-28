// The results page's rows, counted from a lesson's exercises and messages.
// Nothing here reads text a model wrote about the lesson.

import type {
  ConversationExerciseData,
  FeedbackScore,
  GrammarExerciseData,
  Message,
  TranslationExerciseData,
  VocabExerciseData,
  VocabQuestion,
  SessionFeedback,
} from './types';

export type VocabOutcome = 'first_try' | 'retry' | 'missed';

export interface VocabRow {
  slovak: string;
  english: string;
  outcome: VocabOutcome;
}

export interface GrammarRow {
  /** The sentence with the correct word in place of the blank. */
  sentence: string;
  typed: string;
  right: boolean;
}

export interface TranslationRow {
  source: string;
  typed: string;
  modelAnswer: string;
  score: number;
}

export interface ConversationSummary {
  sent: number;
  max: number;
  corrections: string[];
}

/** Every category `compute_category_scores` in backend/app/scoring.py can return. */
export const COMPUTED_CATEGORIES: readonly string[] = [
  'Word recognition (SK\u2192EN)',
  'Recall (EN\u2192SK)',
  'Retry recovery',
  'Accuracy',
  'Translation quality',
];

/**
 * The breakdown bars to draw. Feedback stored before results were counted
 * (no `items_answered`) may hold categories and comments a model wrote: keep
 * only the computed categories, without comments.
 */
export function breakdownScores(feedback: SessionFeedback): FeedbackScore[] {
  if (feedback.items_answered !== undefined) return feedback.scores;
  return feedback.scores
    .filter((s) => COMPUTED_CATEGORIES.includes(s.category))
    .map((s) => ({ ...s, comment: '' }));
}

/** The tutor marks a correction by starting a line with the memo emoji. */
export const CORRECTION_MARK = '\u{1F4DD}';

/** The (slovak, english) pair a vocabulary question teaches. */
function questionPair(q: VocabQuestion): [string, string] {
  const answer = q.choices[q.correctIndex] ?? '';
  return q.direction === 'sk-en' ? [q.word, answer] : [answer, q.word];
}

function vocabCredit(ex: VocabExerciseData, i: number): number | null {
  // Lessons from before credits existed: right or wrong from the last answer.
  if (!ex.credits || ex.credits.every((c) => c === null)) {
    const answer = ex.answers[i];
    if (answer === null || answer === undefined) return null;
    return answer === ex.questions[i].correctIndex ? 1 : 0;
  }
  return ex.credits[i] ?? null;
}

/** One row per answered question: first try (1), on retry (0.5) or missed (0). */
export function vocabRows(ex: VocabExerciseData): VocabRow[] {
  const rows: VocabRow[] = [];
  ex.questions.forEach((q, i) => {
    const credit = vocabCredit(ex, i);
    if (credit === null) return;
    const [slovak, english] = questionPair(q);
    const outcome: VocabOutcome = credit >= 1 ? 'first_try' : credit > 0 ? 'retry' : 'missed';
    rows.push({ slovak, english, outcome });
  });
  return rows;
}

/** Credit first; an item answered before credits existed falls back to `correct`,
 *  as the backend's score does. */
function grammarItemRight(ex: GrammarExerciseData, i: number): boolean {
  const credit = ex.credits?.[i];
  if (credit !== null && credit !== undefined) return credit >= 1;
  return ex.correct[i] === true;
}

/** One row per answered exercise. An answer right but for its accents is right. */
export function grammarRows(ex: GrammarExerciseData): GrammarRow[] {
  const rows: GrammarRow[] = [];
  ex.exercises.forEach((exercise, i) => {
    const typed = ex.answers[i];
    if (typed === null || typed === undefined) return;
    rows.push({
      sentence: exercise.sentence.replace(/_{2,}/, exercise.blank),
      typed,
      right: grammarItemRight(ex, i),
    });
  });
  return rows;
}

/** One row per answered exercise; exercises the learner did not reach are left out. */
export function translationRows(ex: TranslationExerciseData): TranslationRow[] {
  const rows: TranslationRow[] = [];
  ex.exercises.forEach((exercise, i) => {
    const answer = ex.answers[i];
    if (!answer) return;
    rows.push({
      source: exercise.source,
      typed: answer.userAnswer,
      modelAnswer: exercise.modelAnswer,
      score: answer.score,
    });
  });
  return rows;
}

/** Tutor lines that start with the memo emoji, without the emoji. */
export function tutorCorrections(messages: Message[]): string[] {
  const corrections: string[] = [];
  for (const msg of messages) {
    if (msg.role !== 'tutor') continue;
    for (const line of msg.content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith(CORRECTION_MARK)) continue;
      const text = trimmed.slice(CORRECTION_MARK.length).trim();
      if (text) corrections.push(text);
    }
  }
  return corrections;
}

export function conversationSummary(
  ex: ConversationExerciseData,
  messages: Message[],
): ConversationSummary {
  return {
    sent: messages.filter((m) => m.role === 'student').length,
    max: ex.maxExchanges,
    corrections: tutorCorrections(messages),
  };
}

import { describe, it, expect } from 'vitest';
import {
  answersInSlovak,
  translationBadge,
  translationHeading,
  translationPlaceholder,
} from '../translationKinds';
import type { TranslationExercise } from '../types';

function ex(over: Partial<TranslationExercise>): TranslationExercise {
  return { source: 's', direction: 'en-sk', modelAnswer: 'm', keyPoints: [], ...over };
}

describe('translationKinds', () => {
  it('treats an exercise without a kind as a translation', () => {
    expect(translationHeading(ex({ direction: 'en-sk' }))).toBe('Translate to Slovak');
    expect(translationHeading(ex({ direction: 'sk-en' }))).toBe('Translate to English');
  });

  it('names the two new kinds', () => {
    expect(translationHeading(ex({ kind: 'fill_blank' }))).toBe('Fill in the missing word');
    expect(translationHeading(ex({ kind: 'error_correction' }))).toBe('Fix the mistake');
  });

  it('gives a short badge per kind', () => {
    expect(translationBadge(ex({ direction: 'en-sk' }))).toBe('EN → SK');
    expect(translationBadge(ex({ direction: 'sk-en' }))).toBe('SK → EN');
    expect(translationBadge(ex({ kind: 'fill_blank' }))).toBe('Blank');
    expect(translationBadge(ex({ kind: 'error_correction' }))).toBe('Fix');
  });

  it('gives a placeholder per kind', () => {
    expect(translationPlaceholder(ex({}))).toBe('Type your translation...');
    expect(translationPlaceholder(ex({ kind: 'fill_blank' }))).toBe('Type the missing word...');
    expect(translationPlaceholder(ex({ kind: 'error_correction' }))).toBe(
      'Type the corrected sentence...',
    );
  });

  it('knows which answers are typed in Slovak', () => {
    expect(answersInSlovak(ex({ direction: 'en-sk' }))).toBe(true);
    expect(answersInSlovak(ex({ direction: 'sk-en' }))).toBe(false);
    expect(answersInSlovak(ex({ kind: 'fill_blank', direction: 'en-sk' }))).toBe(true);
  });
});

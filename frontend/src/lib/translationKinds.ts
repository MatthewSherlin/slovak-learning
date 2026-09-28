import type { TranslationExercise, TranslationKind } from './types';

function kindOf(exercise: TranslationExercise): TranslationKind {
  return exercise.kind ?? 'translate';
}

export function translationHeading(exercise: TranslationExercise): string {
  const kind = kindOf(exercise);
  if (kind === 'fill_blank') return 'Fill in the missing word';
  if (kind === 'error_correction') return 'Fix the mistake';
  return exercise.direction === 'en-sk' ? 'Translate to Slovak' : 'Translate to English';
}

export function translationBadge(exercise: TranslationExercise): string {
  const kind = kindOf(exercise);
  if (kind === 'fill_blank') return 'Blank';
  if (kind === 'error_correction') return 'Fix';
  return exercise.direction === 'en-sk' ? 'EN → SK' : 'SK → EN';
}

export function translationPlaceholder(exercise: TranslationExercise): string {
  const kind = kindOf(exercise);
  if (kind === 'fill_blank') return 'Type the missing word...';
  if (kind === 'error_correction') return 'Type the corrected sentence...';
  return 'Type your translation...';
}

/** True when the learner's answer is written in Slovak. */
export function answersInSlovak(exercise: TranslationExercise): boolean {
  return exercise.direction === 'en-sk';
}

// Lesson pacing: one place for how long the lesson screens wait and fade.

/** Wait before the next question after a correct answer. */
export const ADVANCE_AFTER_CORRECT_MS = 650;

/** The same wait when the result shows the accented spelling, so it can be read. */
export const ADVANCE_AFTER_ACCENT_MS = 1500;

/** Fade between questions, in seconds (framer-motion's unit). */
export const SCREEN_FADE_S = 0.12;

/** Gap between items in a list that fades in one after another. */
export const LIST_STAGGER_S = 0.03;

/** Latest any list item starts: the tenth item's delay, so no list takes
 *  longer to appear than a ten-item one (0.27s + SCREEN_FADE_S = 0.39s). */
export const LIST_STAGGER_MAX_S = 0.27;

/** Motion props for item `index` of a staggered list: a fade, never a slide. */
export function listItemFade(index: number, reduceMotion: boolean | null) {
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: reduceMotion
      ? { duration: 0, delay: 0 }
      : { duration: SCREEN_FADE_S, delay: Math.min(index * LIST_STAGGER_S, LIST_STAGGER_MAX_S) },
  };
}

/** Ending a lesson usually returns at once; show a loader only if it takes longer. */
export const RESULTS_LOADER_DELAY_MS = 400;

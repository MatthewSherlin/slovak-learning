import { describe, it, expect } from 'vitest';
import { ADVANCE_AFTER_ACCENT_MS, ADVANCE_AFTER_CORRECT_MS, SCREEN_FADE_S, listItemFade } from '../pacing';

// Pinned so a mistyped value fails here, not on a learner's phone.
describe('lesson pacing', () => {
  it('waits 650ms after a correct answer', () => {
    expect(ADVANCE_AFTER_CORRECT_MS).toBe(650);
  });

  it('waits 1500ms when the accented spelling is shown', () => {
    expect(ADVANCE_AFTER_ACCENT_MS).toBe(1500);
  });

  it('fades between questions in 0.12s', () => {
    expect(SCREEN_FADE_S).toBe(0.12);
  });
});

// The review and correction lists on the lesson screens build each item's
// motion props with listItemFade.
describe('listItemFade', () => {
  it('fades an item in without moving it', () => {
    const props = listItemFade(3, false);
    expect(props.initial).toEqual({ opacity: 0 });
    expect(props.animate).toEqual({ opacity: 1 });
    expect(props.initial).not.toHaveProperty('x');
    expect(props.animate).not.toHaveProperty('x');
    expect(props.transition.duration).toBe(SCREEN_FADE_S);
  });

  it('staggers items but shows all of a ten-item list within 0.4s', () => {
    const delays = Array.from({ length: 10 }, (_, i) => listItemFade(i, false).transition.delay);
    expect(delays[0]).toBe(0);
    expect(delays[1]).toBeGreaterThan(0);
    expect(delays[9] + SCREEN_FADE_S).toBeLessThanOrEqual(0.4);
    // A longer list never waits longer than a ten-item one.
    expect(listItemFade(40, false).transition.delay).toBeLessThanOrEqual(delays[9]);
  });

  it('shows items at once under reduced motion', () => {
    expect(listItemFade(5, true).transition).toEqual({ duration: 0, delay: 0 });
  });
});

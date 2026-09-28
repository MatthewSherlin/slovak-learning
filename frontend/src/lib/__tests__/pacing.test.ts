import { describe, it, expect } from 'vitest';
import { ADVANCE_AFTER_ACCENT_MS, ADVANCE_AFTER_CORRECT_MS, SCREEN_FADE_S } from '../pacing';

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

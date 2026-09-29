import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import HomeSkeleton from '../HomeSkeleton';

// jsdom does not compute layout, so these check the styles and classes that
// set the sizes. They mirror pages/Home.tsx, so nothing moves when the real
// page replaces the placeholder.
describe('HomeSkeleton', () => {
  it('starts below the status bar, like the home page', () => {
    const { container } = render(<HomeSkeleton />);
    const page = container.firstElementChild as HTMLElement;
    expect(page.style.paddingTop).toContain('env(safe-area-inset-top)');
  });

  it('holds four mode cards at the height of the real ones', () => {
    const { container } = render(<HomeSkeleton />);
    const cards = container.querySelectorAll<HTMLElement>('[data-testid="skeleton-mode-card"]');
    expect(cards).toHaveLength(4);
    for (const card of cards) {
      // 131px is what a real mode card measures: its padding, icon and two lines of text.
      expect(card.style.height).toBe('131px');
    }
  });

  it('holds no place for a Continue card, which most visits do not have', () => {
    const { container } = render(<HomeSkeleton />);
    expect(container.querySelector('[data-testid="skeleton-continue-card"]')).toBeNull();
    // Header, section heading and the grid: nothing else.
    expect(container.firstElementChild!.children).toHaveLength(3);
  });
});

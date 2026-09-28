import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BrandedLoader from '../BrandedLoader';

describe('BrandedLoader', () => {
  it('renders one progress indicator: the ring, with no sliding bar', () => {
    const { container } = render(<BrandedLoader />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(container.querySelector('[style*="branded-loader-shimmer"]')).toBeNull();
  });

  it('keeps its heading and sub-copy', () => {
    render(<BrandedLoader subCopy="Preparing grammar lesson and exercises" />);
    expect(screen.getByText('Pripravujeme lekciu…')).toBeTruthy();
    expect(screen.getByText('Preparing grammar lesson and exercises')).toBeTruthy();
  });

  it('stops the ring spinning when the learner prefers reduced motion', () => {
    const { container } = render(<BrandedLoader />);
    const css = container.querySelector('style')?.textContent ?? '';
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[^}]*\{[^}]*animation: none/);
  });
});

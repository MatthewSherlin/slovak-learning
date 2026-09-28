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

  it('shows the lesson-building heading and timing hint by default', () => {
    render(<BrandedLoader />);
    expect(screen.getByRole('heading', { name: 'Pripravujeme lekciu…' })).toBeTruthy();
    expect(screen.getByText(/usually 5–10 seconds/)).toBeTruthy();
  });

  it('shows the given heading and no timing hint when told to', () => {
    render(<BrandedLoader heading="Načítavam lekciu…" subCopy="Loading your lesson" hint={null} />);
    expect(screen.getByRole('heading', { name: 'Načítavam lekciu…' })).toBeTruthy();
    expect(screen.queryByText('Pripravujeme lekciu…')).toBeNull();
    expect(screen.queryByText(/seconds/)).toBeNull();
  });

  it('stops the ring spinning when the learner prefers reduced motion', () => {
    const { container } = render(<BrandedLoader />);
    const css = container.querySelector('style')?.textContent ?? '';
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[^}]*\{[^}]*animation: none/);
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import ResultsLoader from '../ResultsLoader';
import { RESULTS_LOADER_DELAY_MS } from '../../lib/pacing';

describe('ResultsLoader', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows nothing while the results are quick to arrive', () => {
    vi.useFakeTimers();
    const { container } = render(<ResultsLoader />);
    act(() => {
      vi.advanceTimersByTime(RESULTS_LOADER_DELAY_MS - 1);
    });
    expect(container.textContent).toBe('');
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows the shared loader, with no mention of analysis, once 400ms have passed', () => {
    vi.useFakeTimers();
    render(<ResultsLoader />);
    act(() => {
      vi.advanceTimersByTime(RESULTS_LOADER_DELAY_MS);
    });
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(screen.queryByText(/analy[sz]ing|generating|feedback/i)).toBeNull();
  });

  it('waits 400ms', () => {
    expect(RESULTS_LOADER_DELAY_MS).toBe(400);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

// Suppress console.error noise from intentional throws in tests
const consoleErrorSpy = vi.spyOn(console, 'error');

beforeEach(() => {
  consoleErrorSpy.mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

function GoodChild() {
  return <div>all good</div>;
}

function BrokenChild(): never {
  throw new Error('Test error');
}

describe('ErrorBoundary', () => {
  it('renders children normally when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>
    );
    expect(screen.getByText('all good')).toBeTruthy();
  });

  it('shows fallback UI with reload text when a child throws', () => {
    render(
      <ErrorBoundary>
        <BrokenChild />
      </ErrorBoundary>
    );
    // Should show fallback with "reload" text (case-insensitive)
    const reloadEl = screen.queryByText(/reload/i);
    expect(reloadEl).toBeTruthy();
  });

  it('does not show children content when a child throws', () => {
    render(
      <ErrorBoundary>
        <BrokenChild />
      </ErrorBoundary>
    );
    expect(screen.queryByText('all good')).toBeFalsy();
  });
});

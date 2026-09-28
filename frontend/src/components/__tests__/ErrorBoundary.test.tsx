/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';
import errorBoundarySource from '../ErrorBoundary.tsx?raw';

// index.css is a stylesheet, not a JS module — Vite's CSS handling means a
// `?raw` import of it resolves to an empty string even under Vitest, so it
// is read from disk directly instead (vitest.config.ts runs with the
// frontend/ package root as its working directory).
const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8');

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

  it('every CSS variable this file reads via var(--x, fallback) is still defined in index.css', () => {
    // ErrorBoundary.tsx is out of scope for edits, so any custom property it
    // depends on — including through the var(x, fallback) form, which a plain
    // var(--x) grep does not match — must still be defined in index.css.
    const referenced = [...errorBoundarySource.matchAll(/var\(--([a-zA-Z0-9-]+)/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThan(0); // sanity: the file still reads some
    const defined = new Set([...indexCss.matchAll(/(?:^|[\s{;])--([a-zA-Z0-9-]+)\s*:/gm)].map((m) => m[1]));
    for (const name of referenced) {
      expect(defined.has(name)).toBe(true);
    }
  });
});

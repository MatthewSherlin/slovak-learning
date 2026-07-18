import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../ThemeProvider';

const STORAGE_KEY = 'theme';

// ── localStorage mock ─────────────────────────────────────────────────

let lsStore: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => lsStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { lsStore[key] = value; }),
  removeItem: vi.fn((key: string) => { delete lsStore[key]; }),
  clear: vi.fn(() => { lsStore = {}; }),
  get length() { return Object.keys(lsStore).length; },
  key: vi.fn((i: number) => Object.keys(lsStore)[i] ?? null),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ── Helper component ───────────────────────────────────────────────────

function ThemeConsumer() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <ThemeProvider>
      <ThemeConsumer />
    </ThemeProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('ThemeProvider', () => {
  beforeEach(() => {
    lsStore = {};
    vi.clearAllMocks();
    localStorageMock.getItem.mockImplementation((key: string) => lsStore[key] ?? null);
    localStorageMock.setItem.mockImplementation((key: string, value: string) => { lsStore[key] = value; });
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to dark theme when no localStorage value is set', () => {
    renderWithProvider();
    expect(screen.getByTestId('theme-value').textContent).toBe('dark');
  });

  it('applies data-theme="dark" to documentElement by default', () => {
    renderWithProvider();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('restores light theme from localStorage on mount', () => {
    lsStore[STORAGE_KEY] = 'light';
    renderWithProvider();
    expect(screen.getByTestId('theme-value').textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('toggle switches dark → light and updates localStorage and data-theme', () => {
    renderWithProvider();
    expect(screen.getByTestId('theme-value').textContent).toBe('dark');

    act(() => {
      screen.getByRole('button', { name: 'toggle' }).click();
    });

    expect(screen.getByTestId('theme-value').textContent).toBe('light');
    expect(lsStore[STORAGE_KEY]).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('toggle switches light → dark and updates localStorage and data-theme', () => {
    lsStore[STORAGE_KEY] = 'light';
    renderWithProvider();

    act(() => {
      screen.getByRole('button', { name: 'toggle' }).click();
    });

    expect(screen.getByTestId('theme-value').textContent).toBe('dark');
    expect(lsStore[STORAGE_KEY]).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('persists to key "theme" in localStorage, not the old key', () => {
    renderWithProvider();

    act(() => {
      screen.getByRole('button', { name: 'toggle' }).click();
    });

    expect(lsStore['theme']).toBe('light');
    expect(lsStore['slovak-learning-theme']).toBeUndefined();
  });
});

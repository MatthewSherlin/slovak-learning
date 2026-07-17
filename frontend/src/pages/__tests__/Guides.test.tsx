import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Guides from '../Guides';

// ── Mock react-markdown (jsdom can't parse it) ────────────────────────

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

// ── Mock useUser ──────────────────────────────────────────────────────

vi.mock('../../components/UserPicker', () => ({
  useUser: () => ({
    user: { id: 'user-42', name: 'Matt', avatar: 'M', color: '#5ea4f7', has_pin: false },
  }),
}));

// ── localStorage mock ─────────────────────────────────────────────────

const LS_KEY = 'guides:read:user-42';

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

function getReadIds(): string[] {
  const raw = localStorageMock.getItem(LS_KEY);
  try {
    return JSON.parse(raw ?? '[]') as string[];
  } catch {
    return [];
  }
}

function renderGuides() {
  return render(
    <MemoryRouter>
      <Guides />
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Guides', () => {
  beforeEach(() => {
    lsStore = {};
    vi.clearAllMocks();
    localStorageMock.getItem.mockImplementation((key: string) => lsStore[key] ?? null);
    localStorageMock.setItem.mockImplementation((key: string, value: string) => { lsStore[key] = value; });
  });

  afterEach(() => {
    lsStore = {};
  });

  it('renders all guide cards', () => {
    renderGuides();
    expect(screen.queryByText('Slovak Pronunciation')).not.toBeNull();
    expect(screen.queryByText('Case System Overview')).not.toBeNull();
    expect(screen.queryByText('Essential Phrases')).not.toBeNull();
  });

  it('shows section count on each guide card', () => {
    renderGuides();
    const matches = screen.queryAllByText(/4 sections/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('shows "0 read" when nothing is stored', () => {
    renderGuides();
    const readTexts = screen.queryAllByText(/0 read/);
    expect(readTexts.length).toBeGreaterThan(0);
  });

  it('persists section id to localStorage when a section is expanded', () => {
    renderGuides();

    // Expand the Pronunciation guide first
    const pronunciationHeader = screen.getByText('Slovak Pronunciation').closest('button')!;
    fireEvent.click(pronunciationHeader);

    // Click a section to expand it (mark as read)
    const vowelSection = screen.getByText('Vowels & Length');
    fireEvent.click(vowelSection);

    const readIds = getReadIds();
    expect(readIds).toContain('pronunciation-0');
  });

  it('marks section as read when it is expanded', () => {
    renderGuides();

    // Expand guide card
    const pronunciationHeader = screen.getByText('Slovak Pronunciation').closest('button')!;
    fireEvent.click(pronunciationHeader);

    // Expand the second section
    const consonantSection = screen.getByText('Consonants & Tricky Sounds');
    fireEvent.click(consonantSection);

    const readIds = getReadIds();
    expect(readIds).toContain('pronunciation-1');
  });

  it('does NOT add duplicate section ids to localStorage', () => {
    renderGuides();

    const pronunciationHeader = screen.getByText('Slovak Pronunciation').closest('button')!;
    fireEvent.click(pronunciationHeader);

    const vowelSection = screen.getByText('Vowels & Length');
    // Toggle open, closed, open again
    fireEvent.click(vowelSection);
    fireEvent.click(vowelSection);
    fireEvent.click(vowelSection);

    const readIds = getReadIds();
    const count = readIds.filter((id) => id === 'pronunciation-0').length;
    expect(count).toBe(1);
  });

  it('renders progress count from stored localStorage state', () => {
    // Pre-seed 2 read sections for pronunciation
    lsStore[LS_KEY] = JSON.stringify(['pronunciation-0', 'pronunciation-1']);

    renderGuides();

    // Should show "2 read" in the guide card subtitle
    expect(screen.queryByText(/2 read/)).not.toBeNull();
  });

  it('handles localStorage errors gracefully (private browsing)', () => {
    localStorageMock.setItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    renderGuides();

    // Expand guide and click a section — should not throw
    const pronunciationHeader = screen.getByText('Slovak Pronunciation').closest('button')!;
    expect(() => fireEvent.click(pronunciationHeader)).not.toThrow();

    const vowelSection = screen.getByText('Vowels & Length');
    expect(() => fireEvent.click(vowelSection)).not.toThrow();
  });

  it('uses ReactMarkdown to render section content (not bespoke parser)', () => {
    renderGuides();

    const pronunciationHeader = screen.getByText('Slovak Pronunciation').closest('button')!;
    fireEvent.click(pronunciationHeader);

    const vowelSection = screen.getByText('Vowels & Length');
    fireEvent.click(vowelSection);

    // The mock ReactMarkdown renders a div[data-testid="markdown"]
    expect(screen.queryAllByTestId('markdown').length).toBeGreaterThan(0);
  });
});

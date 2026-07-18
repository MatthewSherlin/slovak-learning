import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Cards from '../Cards';
import type { CardSet, UserCardCollection, CardSocialEntry } from '../../lib/types';

// ── Mock the API module ───────────────────────────────────────────────

vi.mock('../../lib/api', () => ({
  getCardCatalog: vi.fn(),
  getUserCards: vi.fn(),
  getCardsSocial: vi.fn(),
  purchasePack: vi.fn(),
  getAllCards: vi.fn(),
}));

// ── Mock useUser ──────────────────────────────────────────────────────

vi.mock('../../components/UserPicker', () => ({
  useUser: () => ({
    user: { id: 'user-1', name: 'Matt', avatar: 'M', color: '#5ea4f7', has_pin: false },
  }),
}));

import * as api from '../../lib/api';

// ── Fixtures ──────────────────────────────────────────────────────────

const mockSets: CardSet[] = [
  {
    set_id: 'myty',
    name: 'Mýty a Legendy',
    emoji: '🐉',
    description: 'Mythical creatures',
    cost: 200,
    total_cards: 16,
  },
  {
    set_id: 'jedlo',
    name: 'Jedlo a Kuchyňa',
    emoji: '🍽️',
    description: 'Food and kitchen',
    cost: 150,
    total_cards: 12,
  },
];

const mockCollection: UserCardCollection = {
  cards: [
    {
      id: 1,
      set_id: 'myty',
      set_name: 'Mýty a Legendy',
      set_emoji: '🐉',
      emoji: '🐲',
      slovak: 'drak',
      pronunciation: '/drak/',
      english: 'dragon',
      example_sk: 'Drak žije v horách.',
      example_en: 'The dragon lives in the mountains.',
      rarity: 'rare',
      number: 1,
    },
    {
      id: 2,
      set_id: 'myty',
      set_name: 'Mýty a Legendy',
      set_emoji: '🐉',
      emoji: '🧚',
      slovak: 'víla',
      pronunciation: '/vee-la/',
      english: 'fairy',
      example_sk: 'Víla tancuje.',
      example_en: 'The fairy dances.',
      rarity: 'common',
      number: 2,
    },
  ],
  total_unique: 2,
  total_possible: 28,
  xp_earned: 1000,
  xp_spent: 350,
  xp_available: 650,
};

const mockSocial: CardSocialEntry[] = [
  {
    user_id: 'user-2',
    name: 'Zoe',
    avatar: 'Z',
    color: '#f472b6',
    total_cards: 10,
    sets_progress: { myty: 3, jedlo: 7 },
    showcase_card_id: null,
  },
  {
    user_id: 'user-3',
    name: 'Jan',
    avatar: 'J',
    color: '#22c55e',
    total_cards: 5,
    sets_progress: { myty: 5 },
    showcase_card_id: null,
  },
];

const mockAllCardsResponse = {
  cards: [...mockCollection.cards],
  sets: {},
};

function renderCards() {
  return render(
    <MemoryRouter>
      <Cards />
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Cards — loading state', () => {
  beforeEach(() => {
    vi.mocked(api.getCardCatalog).mockResolvedValue(mockSets);
    vi.mocked(api.getUserCards).mockResolvedValue(mockCollection);
    vi.mocked(api.getCardsSocial).mockResolvedValue(mockSocial);
    vi.mocked(api.getAllCards).mockResolvedValue(mockAllCardsResponse);
  });

  it('shows BinderSkeleton while data is loading', () => {
    // Delay the API so the loading state is visible during render
    vi.mocked(api.getCardCatalog).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.getUserCards).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.getCardsSocial).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.getAllCards).mockImplementation(() => new Promise(() => {}));

    renderCards();

    // The skeleton should show multiple placeholder slots
    const skeletonSlots = document.querySelectorAll('[data-testid="skeleton-slot"]');
    expect(skeletonSlots.length).toBeGreaterThanOrEqual(8);
  });
});

describe('Cards — error state', () => {
  it('shows error message and retry button when API fails', async () => {
    vi.mocked(api.getCardCatalog).mockRejectedValue(new Error('Network error'));
    vi.mocked(api.getUserCards).mockRejectedValue(new Error('Network error'));
    vi.mocked(api.getCardsSocial).mockRejectedValue(new Error('Network error'));
    vi.mocked(api.getAllCards).mockRejectedValue(new Error('Network error'));

    renderCards();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
    });
  });

  it('retries data fetch when retry button is clicked', async () => {
    vi.mocked(api.getCardCatalog).mockRejectedValueOnce(new Error('fail'));
    vi.mocked(api.getUserCards).mockRejectedValueOnce(new Error('fail'));
    vi.mocked(api.getCardsSocial).mockRejectedValueOnce(new Error('fail'));
    vi.mocked(api.getAllCards).mockRejectedValueOnce(new Error('fail'));

    // Second call succeeds
    vi.mocked(api.getCardCatalog).mockResolvedValue(mockSets);
    vi.mocked(api.getUserCards).mockResolvedValue(mockCollection);
    vi.mocked(api.getCardsSocial).mockResolvedValue(mockSocial);
    vi.mocked(api.getAllCards).mockResolvedValue(mockAllCardsResponse);

    renderCards();

    const retryButton = await screen.findByRole('button', { name: /retry/i });
    fireEvent.click(retryButton);

    // After retry, catalog data should load
    await waitFor(() => {
      expect(screen.getByText('Mýty a Legendy')).toBeTruthy();
    });
  });
});

describe('Cards — Shop tab', () => {
  beforeEach(() => {
    vi.mocked(api.getCardCatalog).mockResolvedValue(mockSets);
    vi.mocked(api.getUserCards).mockResolvedValue(mockCollection);
    vi.mocked(api.getCardsSocial).mockResolvedValue(mockSocial);
    vi.mocked(api.getAllCards).mockResolvedValue(mockAllCardsResponse);
  });

  it('renders set names from catalog', async () => {
    renderCards();
    await waitFor(() => {
      expect(screen.getByText('Mýty a Legendy')).toBeTruthy();
      expect(screen.getByText('Jedlo a Kuchyňa')).toBeTruthy();
    });
  });

  it('uses catalog total_cards as denominator (not hardcoded 150)', async () => {
    renderCards();
    await waitFor(() => {
      // 2 cards owned in myty, total is 16 from catalog
      expect(screen.getByText('2/16')).toBeTruthy();
      // 0 cards owned in jedlo, total is 12 from catalog
      expect(screen.getByText('0/12')).toBeTruthy();
    });
  });

  it('shows XP cost for each set', async () => {
    renderCards();
    await waitFor(() => {
      // 200 XP for myty
      expect(screen.getByText('200 XP')).toBeTruthy();
    });
  });

  it('shows COMPLETE badge when all cards in a set are owned', async () => {
    // Make the collection have all 12 jedlo cards
    const completeCards = Array.from({ length: 12 }, (_, i) => ({
      ...mockCollection.cards[0],
      id: 100 + i,
      set_id: 'jedlo',
      set_name: 'Jedlo a Kuchyňa',
      number: i + 1,
    }));

    vi.mocked(api.getUserCards).mockResolvedValue({
      ...mockCollection,
      cards: [...mockCollection.cards, ...completeCards],
    });

    renderCards();

    await waitFor(() => {
      expect(screen.getByText(/complete/i)).toBeTruthy();
    });
  });

  it('shows XP balance chip in header', async () => {
    renderCards();
    await waitFor(() => {
      expect(screen.getByText(/650/)).toBeTruthy();
    });
  });

  it('renders pack composition line', async () => {
    renderCards();
    await waitFor(() => {
      // Should show the composition string
      expect(screen.getAllByText(/8C.*4U.*2R.*1L/)[0]).toBeTruthy();
    });
  });
});

describe('Cards — Binder tab', () => {
  beforeEach(() => {
    vi.mocked(api.getCardCatalog).mockResolvedValue(mockSets);
    vi.mocked(api.getUserCards).mockResolvedValue(mockCollection);
    vi.mocked(api.getCardsSocial).mockResolvedValue(mockSocial);
    vi.mocked(api.getAllCards).mockResolvedValue(mockAllCardsResponse);
  });

  it('switches to Binder tab on click', async () => {
    renderCards();

    const binderTab = await screen.findByRole('button', { name: /binder/i });
    fireEvent.click(binderTab);

    await waitFor(() => {
      // Binder should show set section headers
      expect(screen.getByText('Mýty a Legendy')).toBeTruthy();
    });
  });

  it('shows unowned card slots as empty placeholders with card numbers', async () => {
    renderCards();

    const binderTab = await screen.findByRole('button', { name: /binder/i });
    fireEvent.click(binderTab);

    await waitFor(() => {
      // myty has 16 total, 2 owned, so 14 unowned slots should show numbers
      // Both sets have unowned slot 3, so use getAllByTestId
      const slots = screen.getAllByTestId('unowned-slot-3');
      expect(slots.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows owned card count per set in section header', async () => {
    renderCards();

    const binderTab = await screen.findByRole('button', { name: /binder/i });
    fireEvent.click(binderTab);

    await waitFor(() => {
      // "2 of 16" for myty
      expect(screen.getByText(/2 of 16/)).toBeTruthy();
    });
  });
});

describe('Cards — Friends tab', () => {
  beforeEach(() => {
    vi.mocked(api.getCardCatalog).mockResolvedValue(mockSets);
    vi.mocked(api.getUserCards).mockResolvedValue(mockCollection);
    vi.mocked(api.getCardsSocial).mockResolvedValue(mockSocial);
    vi.mocked(api.getAllCards).mockResolvedValue(mockAllCardsResponse);
  });

  it('switches to Friends tab on click', async () => {
    renderCards();

    const friendsTab = await screen.findByRole('button', { name: /friends/i });
    fireEvent.click(friendsTab);

    await waitFor(() => {
      expect(screen.getByText('Zoe')).toBeTruthy();
      expect(screen.getByText('Jan')).toBeTruthy();
    });
  });

  it('shows card count for each friend', async () => {
    renderCards();

    const friendsTab = await screen.findByRole('button', { name: /friends/i });
    fireEvent.click(friendsTab);

    await waitFor(() => {
      expect(screen.getByText(/10.*cards/i)).toBeTruthy();
      expect(screen.getByText(/5.*cards/i)).toBeTruthy();
    });
  });

  it('shows per-set progress chips for each friend', async () => {
    renderCards();

    const friendsTab = await screen.findByRole('button', { name: /friends/i });
    fireEvent.click(friendsTab);

    await waitFor(() => {
      // Zoe has 3 myty cards, 7 jedlo cards
      // The chips should show set emoji + counts
      expect(screen.getByText(/3\/16/)).toBeTruthy();
      expect(screen.getByText(/7\/12/)).toBeTruthy();
    });
  });
});

describe('Cards — BinderSkeleton structure', () => {
  it('BinderSkeleton renders at least 8 skeleton card slots', () => {
    vi.mocked(api.getCardCatalog).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.getUserCards).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.getCardsSocial).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.getAllCards).mockImplementation(() => new Promise(() => {}));

    renderCards();

    const skeletonSlots = document.querySelectorAll('[data-testid="skeleton-slot"]');
    expect(skeletonSlots.length).toBeGreaterThanOrEqual(8);
  });
});

// ── FIX 1: Binder duplicate badges ────────────────────────────────────

describe('Cards — Binder duplicate badges (FIX 1)', () => {
  const collectionWithCopies: UserCardCollection = {
    ...mockCollection,
    copies: { '1': 2 },
  };

  beforeEach(() => {
    vi.mocked(api.getCardCatalog).mockResolvedValue(mockSets);
    vi.mocked(api.getUserCards).mockResolvedValue(collectionWithCopies);
    vi.mocked(api.getCardsSocial).mockResolvedValue(mockSocial);
    vi.mocked(api.getAllCards).mockResolvedValue(mockAllCardsResponse);
  });

  it('shows ×2 badge on a card tile when copies[card.id] >= 2', async () => {
    renderCards();

    const binderTab = await screen.findByRole('button', { name: /binder/i });
    fireEvent.click(binderTab);

    await waitFor(() => {
      // Card id=1 has 2 copies; badge should render "×2"
      expect(screen.getByTestId('copies-badge-1')).toBeTruthy();
      expect(screen.getByTestId('copies-badge-1').textContent).toMatch(/×2/);
    });
  });

  it('does NOT show a badge on a card tile when copies[card.id] is 1 (not >=2)', async () => {
    renderCards();

    const binderTab = await screen.findByRole('button', { name: /binder/i });
    fireEvent.click(binderTab);

    await waitFor(() => {
      // Card id=2 has 1 copy (not in copies map at all), so no badge
      expect(screen.queryByTestId('copies-badge-2')).toBeNull();
    });
  });
});

// ── FIX 2: Friends showcase thumbnail ────────────────────────────────

describe('Cards — Friends showcase thumbnail (FIX 2)', () => {
  const showcaseCard = {
    id: 1,
    set_id: 'myty',
    set_name: 'Mýty a Legendy',
    set_emoji: '🐉',
    emoji: '🐲',
    slovak: 'drak',
    pronunciation: '/drak/',
    english: 'dragon',
    example_sk: 'Drak žije v horách.',
    example_en: 'The dragon lives in the mountains.',
    rarity: 'rare' as const,
    number: 1,
  };

  const socialWithShowcase: CardSocialEntry[] = [
    {
      user_id: 'user-2',
      name: 'Zoe',
      avatar: 'Z',
      color: '#f472b6',
      total_cards: 10,
      sets_progress: { myty: 3, jedlo: 7 },
      showcase_card_id: 1,
    },
    {
      user_id: 'user-3',
      name: 'Jan',
      avatar: 'J',
      color: '#22c55e',
      total_cards: 5,
      sets_progress: { myty: 5 },
      showcase_card_id: null,
    },
  ];

  beforeEach(() => {
    vi.mocked(api.getCardCatalog).mockResolvedValue(mockSets);
    vi.mocked(api.getUserCards).mockResolvedValue(mockCollection);
    vi.mocked(api.getCardsSocial).mockResolvedValue(socialWithShowcase);
    vi.mocked(api.getAllCards).mockResolvedValue({
      cards: [showcaseCard],
      sets: {},
    });
  });

  it('renders showcase thumbnail for friend with showcase_card_id', async () => {
    renderCards();

    const friendsTab = await screen.findByRole('button', { name: /friends/i });
    fireEvent.click(friendsTab);

    await waitFor(() => {
      // Zoe has showcase_card_id=1, a thumbnail should appear
      expect(screen.getByTestId('showcase-thumb-user-2')).toBeTruthy();
    });
  });

  it('does NOT render showcase thumbnail when showcase_card_id is null', async () => {
    renderCards();

    const friendsTab = await screen.findByRole('button', { name: /friends/i });
    fireEvent.click(friendsTab);

    await waitFor(() => {
      // Jan has no showcase card
      expect(screen.queryByTestId('showcase-thumb-user-3')).toBeNull();
    });
  });
});

// ── FIX 3: Binder grid consistency ────────────────────────────────────

describe('Cards — Binder grid consistency (FIX 3)', () => {
  beforeEach(() => {
    vi.mocked(api.getCardCatalog).mockResolvedValue(mockSets);
    vi.mocked(api.getUserCards).mockResolvedValue(mockCollection);
    vi.mocked(api.getCardsSocial).mockResolvedValue(mockSocial);
    vi.mocked(api.getAllCards).mockResolvedValue(mockAllCardsResponse);
  });

  it('BinderTab card grid has grid-cols-4 class (matches BinderSkeleton responsive cols)', async () => {
    renderCards();

    const binderTab = await screen.findByRole('button', { name: /binder/i });
    fireEvent.click(binderTab);

    await waitFor(() => {
      // The unowned slot is inside a grid; get its parent and check classes
      // slot-3 is inside the myty set grid
      const slot = screen.getAllByTestId('unowned-slot-3')[0];
      const grid = slot.parentElement!;
      // Grid must have grid-cols-4 base (matching BinderSkeleton: grid-cols-4 sm:grid-cols-5)
      expect(grid.classList.contains('grid-cols-4')).toBe(true);
    });
  });
});

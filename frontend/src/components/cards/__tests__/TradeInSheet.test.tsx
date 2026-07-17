import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TradeInSheet from '../TradeInSheet';
import type { UserCardCollection, CardData } from '../../../lib/types';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../lib/api', () => ({
  tradeInCards: vi.fn(),
}));

import * as api from '../../../lib/api';

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    id: 1,
    set_id: 'myty',
    set_name: 'Mýty a Legendy',
    set_emoji: '🧙',
    emoji: '🧙',
    slovak: 'vodník',
    pronunciation: '/VOD-neek/',
    english: 'water spirit',
    example_sk: 'Vodník žije.',
    example_en: 'Water spirit lives.',
    rarity: 'common',
    number: 1,
    ...overrides,
  };
}

/** Build a UserCardCollection with the given cards and copies map. */
function makeCollection(
  cards: CardData[],
  copies: Record<string, number> = {}
): UserCardCollection {
  return {
    cards,
    total_unique: cards.length,
    total_possible: 50,
    xp_earned: 100,
    xp_spent: 20,
    xp_available: 80,
    copies,
  };
}

const noop = () => {};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('TradeInSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists only cards that have copies >= 2 (duplicates only)', () => {
    const cardA = makeCard({ id: 1, slovak: 'vodník' });
    const cardB = makeCard({ id: 2, slovak: 'drak', rarity: 'rare' });
    const cardC = makeCard({ id: 3, slovak: 'víla', rarity: 'uncommon' });

    // cardA: 1 copy (not a duplicate)
    // cardB: 2 copies (duplicate)
    // cardC: 3 copies (duplicate)
    const collection = makeCollection([cardA, cardB, cardC], {
      '1': 1,
      '2': 2,
      '3': 3,
    });

    render(
      <TradeInSheet
        open={true}
        collection={collection}
        userId="user1"
        onClose={noop}
        onSuccess={noop}
      />
    );

    // drak and víla should appear (duplicates)
    expect(screen.getByTestId('trade-row-2')).toBeTruthy();
    expect(screen.getByTestId('trade-row-3')).toBeTruthy();

    // vodník should NOT appear (only 1 copy)
    expect(screen.queryByTestId('trade-row-1')).toBeNull();
  });

  it('sums selected card XP correctly by rarity', () => {
    const cardCommon = makeCard({ id: 10, slovak: 'vlk', rarity: 'common' });
    const cardRare = makeCard({ id: 11, slovak: 'drak', rarity: 'rare' });

    const collection = makeCollection([cardCommon, cardRare], {
      '10': 2, // 1 extra
      '11': 2, // 1 extra
    });

    render(
      <TradeInSheet
        open={true}
        collection={collection}
        userId="user1"
        onClose={noop}
        onSuccess={noop}
      />
    );

    const totalXpEl = () => screen.getByTestId('trade-in-total-xp');

    // Initially 0 XP
    expect(totalXpEl().textContent).toContain('0 XP');

    // Select common card (+20 XP)
    fireEvent.click(screen.getByTestId('trade-row-10'));
    expect(totalXpEl().textContent).toContain('20 XP');

    // Also select rare card (+80 XP → total 100)
    fireEvent.click(screen.getByTestId('trade-row-11'));
    expect(totalXpEl().textContent).toContain('100 XP');

    // Deselect common → back to 80
    fireEvent.click(screen.getByTestId('trade-row-10'));
    expect(totalXpEl().textContent).toContain('80 XP');
  });

  it('shows per-card XP values matching rarity', () => {
    const cards = [
      makeCard({ id: 1, rarity: 'common' }),
      makeCard({ id: 2, rarity: 'uncommon', slovak: 'rusalka' }),
      makeCard({ id: 3, rarity: 'rare', slovak: 'drak' }),
      makeCard({ id: 4, rarity: 'legendary', slovak: 'zmaj' }),
      makeCard({ id: 5, rarity: 'mythic', slovak: 'bazilisk' }),
    ];
    const copies: Record<string, number> = { '1': 2, '2': 2, '3': 2, '4': 2, '5': 2 };

    render(
      <TradeInSheet
        open={true}
        collection={makeCollection(cards, copies)}
        userId="user1"
        onClose={noop}
        onSuccess={noop}
      />
    );

    expect(screen.getByTestId('xp-value-1').textContent).toContain('+20 XP');
    expect(screen.getByTestId('xp-value-2').textContent).toContain('+40 XP');
    expect(screen.getByTestId('xp-value-3').textContent).toContain('+80 XP');
    expect(screen.getByTestId('xp-value-4').textContent).toContain('+200 XP');
    expect(screen.getByTestId('xp-value-5').textContent).toContain('+500 XP');
  });

  it('shows success state (xp_gained) after a successful trade and does NOT show error', async () => {
    const card = makeCard({ id: 7, slovak: 'víla', rarity: 'uncommon' });
    const collection = makeCollection([card], { '7': 3 });

    vi.mocked(api.tradeInCards).mockResolvedValueOnce({ traded: [7], xp_gained: 40 });

    render(
      <TradeInSheet
        open={true}
        collection={collection}
        userId="user1"
        onClose={noop}
        onSuccess={noop}
      />
    );

    // Select card then confirm
    fireEvent.click(screen.getByTestId('trade-row-7'));
    fireEvent.click(screen.getByTestId('trade-in-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('trade-in-success')).toBeTruthy();
    });

    expect(screen.getByTestId('trade-in-success').textContent).toContain('+40 XP');
    expect(screen.queryByTestId('trade-in-error')).toBeNull();
  });

  it('shows inline error and no success state when API returns 400', async () => {
    const card = makeCard({ id: 8, slovak: 'drak', rarity: 'rare' });
    const collection = makeCollection([card], { '8': 2 });

    vi.mocked(api.tradeInCards).mockRejectedValueOnce(new Error('Not a duplicate'));

    render(
      <TradeInSheet
        open={true}
        collection={collection}
        userId="user1"
        onClose={noop}
        onSuccess={noop}
      />
    );

    fireEvent.click(screen.getByTestId('trade-row-8'));
    fireEvent.click(screen.getByTestId('trade-in-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('trade-in-error')).toBeTruthy();
    });

    expect(screen.getByTestId('trade-in-error').textContent).toContain('Not a duplicate');
    expect(screen.queryByTestId('trade-in-success')).toBeNull();
  });

  it('confirm button is disabled when no cards are selected', () => {
    const card = makeCard({ id: 9, slovak: 'vodník', rarity: 'common' });
    const collection = makeCollection([card], { '9': 2 });

    render(
      <TradeInSheet
        open={true}
        collection={collection}
        userId="user1"
        onClose={noop}
        onSuccess={noop}
      />
    );

    const confirmBtn = screen.getByTestId('trade-in-confirm') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  it('shows empty state when there are no duplicates', () => {
    const card = makeCard({ id: 99, slovak: 'vlk', rarity: 'common' });
    const collection = makeCollection([card], { '99': 1 });

    render(
      <TradeInSheet
        open={true}
        collection={collection}
        userId="user1"
        onClose={noop}
        onSuccess={noop}
      />
    );

    expect(screen.queryByTestId('trade-row-99')).toBeNull();
    expect(screen.getByText(/No duplicate cards/i)).toBeTruthy();
  });

  it('does not render the sheet when open=false', () => {
    const collection = makeCollection([]);

    render(
      <TradeInSheet
        open={false}
        collection={collection}
        userId="user1"
        onClose={noop}
        onSuccess={noop}
      />
    );

    expect(screen.queryByTestId('trade-in-sheet')).toBeNull();
  });
});

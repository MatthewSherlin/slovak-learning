import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PackOpening from '../PackOpening';
import type { CardData, PackPurchaseResult, CardSet } from '../../../lib/types';

// ── Fixtures ──────────────────────────────────────────────────────────

const makeCard = (overrides: Partial<CardData> = {}): CardData => ({
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
});

const CARDS: CardData[] = [
  makeCard({ id: 1, number: 1, rarity: 'common' }),
  makeCard({ id: 2, number: 2, rarity: 'uncommon' }),
  makeCard({ id: 3, number: 3, rarity: 'rare' }),
  makeCard({ id: 4, number: 4, rarity: 'legendary' }),
  makeCard({ id: 5, number: 5, rarity: 'mythic' }),
];

const PURCHASE_RESULT: PackPurchaseResult = {
  cards: CARDS,
  new_card_ids: [1, 2, 3],
  duplicate_card_ids: [4, 5],
  copies: { '4': 2, '5': 3 },
  xp_cost: 150,
};

const TEST_SET: CardSet = {
  set_id: 'myty',
  name: 'Mýty a Legendy',
  emoji: '🧙',
  description: 'Slovak myths',
  cost: 150,
  total_cards: 15,
};

// ── Tests ─────────────────────────────────────────────────────────────

describe('PackOpening — state machine', () => {
  it('renders in sealed state initially', () => {
    render(
      <PackOpening
        set={TEST_SET}
        result={PURCHASE_RESULT}
        onDone={() => {}}
      />
    );
    // Foil strip with POTIAHNI should be visible
    expect(screen.getByText('POTIAHNI')).toBeTruthy();
  });

  it('transitions from sealed to revealed when fallback button is clicked', async () => {
    render(
      <PackOpening
        set={TEST_SET}
        result={PURCHASE_RESULT}
        onDone={() => {}}
      />
    );

    // Click the accessible fallback "Otvoriť" button
    const openBtn = screen.getByRole('button', { name: /otvoriť/i });
    fireEvent.click(openBtn);

    // After transition, cards should appear (face-down initially)
    await waitFor(() => {
      // 5 flip buttons should appear, one per card
      const flipBtns = screen.getAllByRole('button', { name: /flip card/i });
      expect(flipBtns).toHaveLength(5);
    });
  });
});

describe('PackOpening — flip behaviour', () => {
  async function renderAndReveal() {
    const { getByRole, getAllByRole } = render(
      <PackOpening
        set={TEST_SET}
        result={PURCHASE_RESULT}
        onDone={() => {}}
      />
    );

    // Trigger tear via fallback button
    fireEvent.click(getByRole('button', { name: /otvoriť/i }));

    // Wait for cards to appear
    await waitFor(() => {
      expect(getAllByRole('button', { name: /flip card/i })).toHaveLength(5);
    });

    return { getByRole, getAllByRole };
  }

  it('Continue button is disabled until all 5 cards are flipped', async () => {
    const { getByRole, getAllByRole } = await renderAndReveal();

    // Continue should be disabled before any flips
    const continueBtn = getByRole('button', { name: /continue/i });
    expect(continueBtn.hasAttribute('disabled')).toBe(true);

    // Flip all 5 cards
    const flipBtns = getAllByRole('button', { name: /flip card/i });
    for (const btn of flipBtns) {
      fireEvent.click(btn);
    }

    // Continue should now be enabled
    await waitFor(() => {
      expect(getByRole('button', { name: /continue/i }).hasAttribute('disabled')).toBe(false);
    });
  });

  it('flipping a card removes the flip button for that card', async () => {
    const { getAllByRole } = await renderAndReveal();

    const flipBtns = getAllByRole('button', { name: /flip card/i });
    expect(flipBtns).toHaveLength(5);

    // Flip one card
    fireEvent.click(flipBtns[0]);

    await waitFor(() => {
      expect(getAllByRole('button', { name: /flip card/i })).toHaveLength(4);
    });
  });
});

describe('PackOpening — badge derivation', () => {
  async function renderFlipAll() {
    const onDone = vi.fn();
    const { getByRole, getAllByRole } = render(
      <PackOpening
        set={TEST_SET}
        result={PURCHASE_RESULT}
        onDone={onDone}
      />
    );

    fireEvent.click(getByRole('button', { name: /otvoriť/i }));

    await waitFor(() => {
      expect(getAllByRole('button', { name: /flip card/i })).toHaveLength(5);
    });

    const flipBtns = getAllByRole('button', { name: /flip card/i });
    for (const btn of flipBtns) {
      fireEvent.click(btn);
    }

    await waitFor(() => {
      expect(getByRole('button', { name: /continue/i }).hasAttribute('disabled')).toBe(false);
    });

    return { getByRole, getAllByRole, onDone };
  }

  it('shows NEW badge on cards in new_card_ids', async () => {
    await renderFlipAll();
    // Cards 1, 2, 3 are new — at least one NEW badge should show
    const newBadges = screen.getAllByText(/new/i);
    expect(newBadges.length).toBeGreaterThan(0);
  });

  it('shows duplicate badge on cards in duplicate_card_ids', async () => {
    await renderFlipAll();
    // Cards 4, 5 are duplicates
    const dupeBadges = screen.getAllByText(/dupe|duplicate|×/i);
    expect(dupeBadges.length).toBeGreaterThan(0);
  });

  it('calls onDone when Continue is clicked after all cards are flipped', async () => {
    const { getByRole, onDone } = await renderFlipAll();

    fireEvent.click(getByRole('button', { name: /continue/i }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});

describe('PackOpening — drag-end threshold logic (unit)', () => {
  // Import the pure function directly to avoid drag gesture simulation
  it('treats offset >= 80px as a successful tear', async () => {
    const { tearThresholdMet } = await import('../PackOpening');
    expect(tearThresholdMet(80)).toBe(true);
    expect(tearThresholdMet(79)).toBe(false);
    expect(tearThresholdMet(200)).toBe(true);
  });
});

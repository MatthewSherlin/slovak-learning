import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CardArt from '../CardArt';
import CardFrame from '../CardFrame';
import type { CardData } from '../../../lib/types';

const baseCard: CardData = {
  id: 1,
  set_id: 'jedlo',
  set_name: 'Jedlo',
  set_emoji: '🍽️',
  emoji: '🥣',
  slovak: 'vodník',
  pronunciation: '/VOD-neek/',
  english: 'water spirit',
  example_sk: 'Vodník žije na dne rybníka.',
  example_en: 'The water spirit lives at the bottom of the pond.',
  rarity: 'common',
  number: 1,
};

// ---------- CardArt ----------
describe('CardArt', () => {
  it('renders an img element with the correct src path', () => {
    const { container } = render(<CardArt card={baseCard} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('/cards/jedlo/1.jpg');
  });

  it('swaps to monogram fallback when image errors', () => {
    const { container } = render(<CardArt card={baseCard} />);
    const img = container.querySelector('img')!;
    fireEvent.error(img);
    // After error, the monogram text (first letter of slovak) should appear
    expect(screen.getByText('v')).toBeTruthy();
  });

  it('monogram shows first letter of slovak field', () => {
    const card: CardData = { ...baseCard, slovak: 'poludnica' };
    const { container } = render(<CardArt card={card} />);
    const img = container.querySelector('img')!;
    fireEvent.error(img);
    expect(screen.getByText('p')).toBeTruthy();
  });
});

// ---------- CardFrame — rarity classes ----------
describe('CardFrame rarity', () => {
  it('renders with mythic-frame class for mythic rarity', () => {
    const card: CardData = { ...baseCard, rarity: 'mythic' };
    const { container } = render(<CardFrame card={card} setTotal={15} />);
    expect(container.querySelector('[data-rarity="mythic"]')).not.toBeNull();
  });

  it('renders with legendary-frame class for legendary rarity', () => {
    const card: CardData = { ...baseCard, rarity: 'legendary' };
    const { container } = render(<CardFrame card={card} setTotal={15} />);
    expect(container.querySelector('[data-rarity="legendary"]')).not.toBeNull();
  });

  it('renders with rare-frame class for rare rarity', () => {
    const card: CardData = { ...baseCard, rarity: 'rare' };
    const { container } = render(<CardFrame card={card} setTotal={15} />);
    expect(container.querySelector('[data-rarity="rare"]')).not.toBeNull();
  });

  it('renders with common-frame class for common rarity', () => {
    const { container } = render(<CardFrame card={baseCard} setTotal={15} />);
    expect(container.querySelector('[data-rarity="common"]')).not.toBeNull();
  });
});

// ---------- CardFrame — footer number ----------
describe('CardFrame number footer', () => {
  it('formats number and setTotal with 3-digit zero-padding', () => {
    render(<CardFrame card={baseCard} setTotal={16} />);
    expect(screen.getByText('001 / 016')).toBeTruthy();
  });

  it('uses the setTotal prop as denominator (not a hardcoded value)', () => {
    render(<CardFrame card={{ ...baseCard, number: 7 }} setTotal={42} />);
    expect(screen.getByText('007 / 042')).toBeTruthy();
  });

  it('handles single-digit card number', () => {
    render(<CardFrame card={{ ...baseCard, number: 3 }} setTotal={10} />);
    expect(screen.getByText('003 / 010')).toBeTruthy();
  });
});

// ---------- CardFrame — content ----------
describe('CardFrame content', () => {
  it('displays the slovak word', () => {
    render(<CardFrame card={baseCard} setTotal={15} />);
    expect(screen.getByText('vodník')).toBeTruthy();
  });

  it('displays the set name', () => {
    render(<CardFrame card={baseCard} setTotal={15} />);
    expect(screen.getByText('Jedlo')).toBeTruthy();
  });

  it('displays the rarity label', () => {
    render(<CardFrame card={baseCard} setTotal={15} />);
    expect(screen.getByText('Common')).toBeTruthy();
  });

  it('displays the example sentence', () => {
    render(<CardFrame card={baseCard} setTotal={15} />);
    expect(screen.getByText((t) => t.includes('Vodník žije na dne rybníka.'))).toBeTruthy();
  });
});

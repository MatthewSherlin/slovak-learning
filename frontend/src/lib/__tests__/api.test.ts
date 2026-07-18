import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRecommendations, tradeInCards, setShowcase, getAllCards } from '../api';

describe('getRecommendations', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hits /api/users/{id}/recommendations and returns parsed result', async () => {
    const mockPayload = {
      in_progress_session: null,
      due_words: 5,
      weakest_concept: null,
      recommended: [{ kind: 'review_vocab', label: 'Review Vocab', mode: 'vocabulary' }],
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPayload),
    } as Response);

    const result = await getRecommendations('u1');

    expect(fetch).toHaveBeenCalledOnce();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('/api/users/u1/recommendations');
    expect(result).toEqual(mockPayload);
  });
});

describe('tradeInCards', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs {card_ids} to /api/users/{id}/cards/trade-in', async () => {
    const mockPayload = { traded: [1, 2], xp_gained: 50 };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPayload),
    } as Response);

    const result = await tradeInCards('u1', [1, 2]);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('/api/users/u1/cards/trade-in');
    expect(opts?.method).toBe('POST');
    expect(JSON.parse(opts?.body as string)).toEqual({ card_ids: [1, 2] });
    expect(result).toEqual(mockPayload);
  });
});

describe('setShowcase', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PUTs {card_id} to /api/users/{id}/showcase', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    } as Response);

    await setShowcase('u1', 42);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('/api/users/u1/showcase');
    expect(opts?.method).toBe('PUT');
    expect(JSON.parse(opts?.body as string)).toEqual({ card_id: 42 });
  });

  it('PUTs {card_id: null} when clearing showcase', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    } as Response);

    await setShowcase('u1', null);

    const [, opts] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(opts?.body as string)).toEqual({ card_id: null });
  });
});

describe('getAllCards', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs /api/cards/all and returns { cards, sets }', async () => {
    const mockPayload = {
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
          example_sk: 'Drak žije.',
          example_en: 'Dragon lives.',
          rarity: 'rare',
          number: 1,
        },
      ],
      sets: { myty: { set_id: 'myty', name: 'Mýty a Legendy' } },
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPayload),
    } as Response);

    const result = await getAllCards();

    expect(fetch).toHaveBeenCalledOnce();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('/api/cards/all');
    expect(result).toEqual(mockPayload);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].id).toBe(1);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installMemoryStorage, MemoryStorage } from '../../test/memoryStorage';

// jsdom has no Web Audio. This stand-in records every oscillator and gain
// node the sounds create, so tests can read what would be played.

interface FakeOscillator {
  type: string;
  frequency: { value: number };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

interface FakeGain {
  gain: {
    setValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
}

let oscillators: FakeOscillator[] = [];
let gains: FakeGain[] = [];

class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  resume = vi.fn();
  createOscillator(): FakeOscillator {
    const osc = { type: 'sine', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    oscillators.push(osc);
    return osc;
  }
  createGain(): FakeGain {
    const node = {
      gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
    gains.push(node);
    return node;
  }
}

/** Every gain value a node is set or ramped to. */
function gainValues(node: FakeGain): number[] {
  return [
    ...node.gain.setValueAtTime.mock.calls,
    ...node.gain.linearRampToValueAtTime.mock.calls,
    ...node.gain.exponentialRampToValueAtTime.mock.calls,
  ].map(call => call[0] as number);
}

// sounds.ts keeps one AudioContext per page; load a fresh copy for each test.
async function loadSounds() {
  vi.resetModules();
  return import('../sounds');
}

describe('sounds', () => {
  let uninstallStorage = () => {};

  beforeEach(() => {
    oscillators = [];
    gains = [];
    uninstallStorage = installMemoryStorage().uninstall;
    Object.defineProperty(window, 'AudioContext', { value: FakeAudioContext, configurable: true, writable: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'AudioContext');
    uninstallStorage();
    vi.restoreAllMocks();
  });

  describe('with sound disabled in localStorage', () => {
    it('playCorrect creates no oscillator', async () => {
      localStorage.setItem('sound-enabled', 'false');
      const { playCorrect } = await loadSounds();
      playCorrect();
      expect(oscillators).toHaveLength(0);
    });

    it('playIncorrect creates no oscillator', async () => {
      localStorage.setItem('sound-enabled', 'false');
      const { playIncorrect } = await loadSounds();
      playIncorrect();
      expect(oscillators).toHaveLength(0);
    });

    it('takes effect at once, without a reload', async () => {
      const { playCorrect, setSoundEnabled } = await loadSounds();
      setSoundEnabled(false);
      playCorrect();
      expect(oscillators).toHaveLength(0);
      setSoundEnabled(true);
      playCorrect();
      expect(oscillators.length).toBeGreaterThan(0);
    });
  });

  describe('with sound on (the default)', () => {
    it('playCorrect plays two rising sine notes', async () => {
      const { playCorrect } = await loadSounds();
      playCorrect();
      expect(oscillators).toHaveLength(2);
      expect(oscillators.map(o => o.type)).toEqual(['sine', 'sine']);
      expect(oscillators[1].frequency.value).toBeGreaterThan(oscillators[0].frequency.value);
    });

    it('playIncorrect plays two falling soft notes, with no square wave', async () => {
      const { playIncorrect } = await loadSounds();
      playIncorrect();
      expect(oscillators).toHaveLength(2);
      for (const osc of oscillators) expect(['sine', 'triangle']).toContain(osc.type);
      expect(oscillators[1].frequency.value).toBeLessThan(oscillators[0].frequency.value);
    });

    it.each(['playCorrect', 'playIncorrect'] as const)(
      '%s peaks at a gain of at most 0.08, reached by a 10ms attack from silence',
      async (name) => {
        const sounds = await loadSounds();
        sounds[name]();
        expect(gains).toHaveLength(2);
        oscillators.forEach((osc, i) => {
          const start = osc.start.mock.calls[0][0] as number;
          const node = gains[i];
          expect(Math.max(...gainValues(node))).toBeLessThanOrEqual(0.08);
          expect(node.gain.setValueAtTime).toHaveBeenCalledWith(0, start);
          const [, peakAt] = node.gain.linearRampToValueAtTime.mock.calls[0];
          expect(peakAt).toBeCloseTo(start + 0.01, 5);
        });
      },
    );

    it.each(['playCorrect', 'playIncorrect'] as const)('%s lasts under 350ms', async (name) => {
      const sounds = await loadSounds();
      sounds[name]();
      const end = Math.max(...oscillators.map(o => o.stop.mock.calls[0][0] as number));
      expect(end).toBeLessThan(0.35);
    });
  });

  it('plays when the setting cannot be read, as in private browsing', async () => {
    vi.spyOn(MemoryStorage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const { playCorrect, isSoundEnabled } = await loadSounds();
    expect(isSoundEnabled()).toBe(true);
    playCorrect();
    expect(oscillators).toHaveLength(2);
  });

  it('ignores a failure to store the setting', async () => {
    vi.spyOn(MemoryStorage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { setSoundEnabled } = await loadSounds();
    expect(() => setSoundEnabled(false)).not.toThrow();
  });
});

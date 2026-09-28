import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { canSpeakSlovak, speakSlovak, cancelSpeech, useCanSpeakSlovak } from '../speech';
import { installFakeSpeech, type FakeSpeech } from '../../test/fakeSpeech';

describe('speech', () => {
  let fake: FakeSpeech | null = null;

  afterEach(() => {
    fake?.uninstall();
    fake = null;
  });

  describe('canSpeakSlovak', () => {
    it('is false when the browser has no speech synthesis', () => {
      expect(canSpeakSlovak()).toBe(false);
    });

    it('is false with no voices', () => {
      fake = installFakeSpeech([]);
      expect(canSpeakSlovak()).toBe(false);
    });

    it('is false with only voices of other languages', () => {
      fake = installFakeSpeech([{ name: 'Samantha', lang: 'en-US' }, { name: 'Zuzana (Czech)', lang: 'cs-CZ' }]);
      expect(canSpeakSlovak()).toBe(false);
    });

    it('is true with an sk-SK voice', () => {
      fake = installFakeSpeech([{ name: 'Samantha', lang: 'en-US' }, { name: 'Laura', lang: 'sk-SK' }]);
      expect(canSpeakSlovak()).toBe(true);
    });

    it("accepts Android's sk_SK and any letter case", () => {
      fake = installFakeSpeech([{ name: 'Slovak', lang: 'sk_SK' }]);
      expect(canSpeakSlovak()).toBe(true);
      fake.setVoices([{ name: 'Slovak', lang: 'SK-sk' }]);
      expect(canSpeakSlovak()).toBe(true);
    });
  });

  describe('speakSlovak', () => {
    it('cancels what is being said, then speaks the text in sk-SK with the Slovak voice', () => {
      const laura = { name: 'Laura', lang: 'sk-SK' };
      fake = installFakeSpeech([{ name: 'Samantha', lang: 'en-US' }, laura]);
      speakSlovak('ďakujem');

      expect(fake.synth.cancel).toHaveBeenCalledTimes(1);
      expect(fake.synth.speak).toHaveBeenCalledTimes(1);
      const utterance = fake.synth.speak.mock.calls[0][0];
      expect(utterance.text).toBe('ďakujem');
      expect(utterance.lang).toBe('sk-SK');
      expect(utterance.rate).toBe(0.85);
      expect(utterance.voice).toBe(laura);
      expect(fake.synth.cancel.mock.invocationCallOrder[0])
        .toBeLessThan(fake.synth.speak.mock.invocationCallOrder[0]);
    });

    it('says nothing rather than read Slovak with a voice of another language', () => {
      fake = installFakeSpeech([{ name: 'Samantha', lang: 'en-US' }]);
      speakSlovak('ďakujem');
      expect(fake.synth.speak).not.toHaveBeenCalled();
    });

    it('does nothing when the browser has no speech synthesis', () => {
      expect(() => speakSlovak('ďakujem')).not.toThrow();
    });
  });

  describe('cancelSpeech', () => {
    it('stops what is being said', () => {
      fake = installFakeSpeech([{ name: 'Laura', lang: 'sk-SK' }]);
      cancelSpeech();
      expect(fake.synth.cancel).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the browser has no speech synthesis', () => {
      expect(() => cancelSpeech()).not.toThrow();
    });
  });

  describe('useCanSpeakSlovak', () => {
    it('turns true when a Slovak voice arrives late', () => {
      fake = installFakeSpeech([]);
      const { result } = renderHook(() => useCanSpeakSlovak());
      expect(result.current).toBe(false);

      act(() => fake!.setVoices([{ name: 'Laura', lang: 'sk-SK' }]));
      expect(result.current).toBe(true);
    });

    it('stops listening for voices once unmounted', () => {
      fake = installFakeSpeech([]);
      const { result, unmount } = renderHook(() => useCanSpeakSlovak());
      unmount();
      act(() => fake!.setVoices([{ name: 'Laura', lang: 'sk-SK' }]));
      expect(result.current).toBe(false);
    });
  });
});

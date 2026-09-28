import { vi } from 'vitest';

// jsdom has no speech synthesis. This is a small stand-in that tests install on
// window and remove afterwards.

export interface FakeVoice {
  name: string;
  lang: string;
}

export interface FakeSpeech {
  synth: EventTarget & {
    getVoices: () => FakeVoice[];
    speak: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
  /** Replace the voice list and announce it, as a browser does when voices load late. */
  setVoices: (voices: FakeVoice[]) => void;
  uninstall: () => void;
}

class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  voice: FakeVoice | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

export function installFakeSpeech(initialVoices: FakeVoice[] = []): FakeSpeech {
  let voices = initialVoices;
  const synth = Object.assign(new EventTarget(), {
    getVoices: () => voices,
    speak: vi.fn(),
    cancel: vi.fn(),
  });
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true, writable: true });
  return {
    synth,
    setVoices(next) {
      voices = next;
      synth.dispatchEvent(new Event('voiceschanged'));
    },
    uninstall() {
      Reflect.deleteProperty(window, 'speechSynthesis');
      Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
    },
  };
}

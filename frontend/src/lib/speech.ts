/**
 * Spoken pronunciation with the browser's own speech synthesis.
 *
 * Only a Slovak voice is ever used: a Slovak word read by a voice of another
 * language teaches the wrong sounds, which is worse than silence. Phones load
 * their voices late (iOS and Android both), and some have no Slovak voice.
 */
import { useEffect, useState } from 'react';

// sk-SK, sk_SK (Android), sk, in any letter case.
const SLOVAK_LANG = /^sk([-_]|$)/i;

function getSynth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;
}

function findSlovakVoice(): SpeechSynthesisVoice | null {
  const synth = getSynth();
  if (!synth) return null;
  return synth.getVoices().find(voice => SLOVAK_LANG.test(voice.lang)) ?? null;
}

export function canSpeakSlovak(): boolean {
  return findSlovakVoice() !== null;
}

/** Say `text` in Slovak, cutting off anything already being said. Silent without a Slovak voice. */
export function speakSlovak(text: string): void {
  const synth = getSynth();
  const voice = findSlovakVoice();
  if (!synth || !voice) return;
  synth.cancel();
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = 'sk-SK';
  utterance.rate = 0.85;
  synth.speak(utterance);
}

/** Stop anything being said, so a word is not read over the next screen. */
export function cancelSpeech(): void {
  getSynth()?.cancel();
}

// A browser that loads voices late but never fires voiceschanged still gets
// one more look once they have had time to arrive.
const LATE_VOICES_CHECK_MS = 1000;

/** Whether a Slovak voice is available; re-renders when the voices arrive. */
export function useCanSpeakSlovak(): boolean {
  const [canSpeak, setCanSpeak] = useState(canSpeakSlovak);

  useEffect(() => {
    const synth = getSynth();
    if (!synth) return;
    const update = () => setCanSpeak(canSpeakSlovak());
    update();
    // Guarded: a lesson must not break on a browser whose speechSynthesis is not an event target.
    synth.addEventListener?.('voiceschanged', update);
    const timer = setTimeout(update, LATE_VOICES_CHECK_MS);
    return () => {
      synth.removeEventListener?.('voiceschanged', update);
      clearTimeout(timer);
    };
  }, []);

  return canSpeak;
}

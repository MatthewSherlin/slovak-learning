/**
 * Web Audio API sound effects for correct/incorrect answer feedback.
 * No external audio files needed — synthesized tones only.
 */

const SOUND_ENABLED_KEY = 'sound-enabled';

/** The "Answer sounds" setting. Storage can throw (private browsing); that reads as on. */
export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_ENABLED_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_ENABLED_KEY, String(enabled));
  } catch {
    // Not stored; the switch still shows the choice until the settings close.
  }
}

let ctx: AudioContext | null = null;

/** null when the browser has no Web Audio; sounds become a no-op rather than throwing. */
function getCtx(): AudioContext | null {
  if (!ctx) {
    if (typeof AudioContext === 'undefined') return null;
    ctx = new AudioContext();
  }
  return ctx;
}

const PEAK_GAIN = 0.08;
const ATTACK_S = 0.01; // a short fade-in, so the note starts without a click

function playTone(ac: AudioContext, freq: number, startTime: number, duration: number, type: OscillatorType) {
  const osc = ac.createOscillator();
  const vol = ac.createGain();

  osc.type = type;
  osc.frequency.value = freq;
  vol.gain.setValueAtTime(0, startTime);
  vol.gain.linearRampToValueAtTime(PEAK_GAIN, startTime + ATTACK_S);
  vol.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(vol);
  vol.connect(ac.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

/** Soft ascending two-note chime for correct answers (about 0.32s). */
export function playCorrect() {
  if (!isSoundEnabled()) return;
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === 'suspended') ac.resume();
  const now = ac.currentTime;
  playTone(ac, 523.25, now, 0.15, 'sine');        // C5
  playTone(ac, 783.99, now + 0.1, 0.22, 'sine');  // G5
}

/** Soft descending two-note tone for incorrect answers (about 0.32s). */
export function playIncorrect() {
  if (!isSoundEnabled()) return;
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === 'suspended') ac.resume();
  const now = ac.currentTime;
  playTone(ac, 440.0, now, 0.15, 'triangle');        // A4
  playTone(ac, 349.23, now + 0.1, 0.22, 'triangle'); // F4
}

/**
 * Creates and resumes the shared AudioContext, without playing anything.
 * iOS only allows this from inside a tap handler, so callers run it
 * synchronously at the start of the handler, before any `await` — not after
 * the network call that plays the actual sound.
 */
export function primeSound(): void {
  if (!isSoundEnabled()) return;
  const ac = getCtx();
  if (ac && ac.state === 'suspended') ac.resume();
}

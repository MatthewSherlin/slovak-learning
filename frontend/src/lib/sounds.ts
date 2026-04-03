/**
 * Web Audio API sound effects for correct/incorrect answer feedback.
 * No external audio files needed — synthesized tones only.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
  }
  return ctx;
}

function playTone(freq: number, startTime: number, duration: number, gain: number, type: OscillatorType = 'sine') {
  const ac = getCtx();
  const osc = ac.createOscillator();
  const vol = ac.createGain();

  osc.type = type;
  osc.frequency.value = freq;
  vol.gain.setValueAtTime(gain, startTime);
  vol.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(vol);
  vol.connect(ac.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

/** Pleasant ascending two-tone chime for correct answers. */
export function playCorrect() {
  const ac = getCtx();
  if (ac.state === 'suspended') ac.resume();
  const now = ac.currentTime;
  playTone(523.25, now, 0.15, 0.18);        // C5
  playTone(783.99, now + 0.12, 0.22, 0.15); // G5
}

/** Short low descending buzz for incorrect answers. */
export function playIncorrect() {
  const ac = getCtx();
  if (ac.state === 'suspended') ac.resume();
  const now = ac.currentTime;
  playTone(311.13, now, 0.15, 0.16, 'square');       // Eb4
  playTone(233.08, now + 0.12, 0.25, 0.13, 'square'); // Bb3
}

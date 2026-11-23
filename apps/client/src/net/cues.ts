/**
 * Direction cues (UI_UX §3): so players don't stare at the screen while walking,
 * the pin reveal and the arrival at a pin buzz (Android: `navigator.vibrate`) and
 * chime. iOS has no vibration, so the chime and the toast are the fallback.
 */
import type { GameEvent } from '@afterdark/shared';

const BUZZ_REVEAL_MS = [120, 60, 120];
const BUZZ_ARRIVE_MS = [200, 80, 200, 80, 300];
const BUZZ_COMPROMISED_MS = [60, 40, 60, 40, 220];
const BUZZ_EXPOSED_MS = [250];
const BUZZ_FAILED_MS = [100, 50, 100];
const CHIME_HZ = { revealed: 660, atPin: 880, done: 1040, glitch: 180, exposed: 520 } as const;
const CHIME_S = 0.18;
const CHIME_GAIN = 0.08;

let audio: AudioContext | undefined;

function chime(hz: number, wave: OscillatorType = 'sine'): void {
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(CHIME_GAIN, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + CHIME_S);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + CHIME_S);
  } catch {
    // No audio (blocked by the browser or unsupported): the toast is the cue.
  }
}

export function buzz(pattern: number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported (iOS): ignore.
  }
}

/** Plays the cue for a server event, if it has one. */
export function playCue(event: GameEvent): void {
  switch (event.type) {
    case 'task.revealed':
      buzz(BUZZ_REVEAL_MS);
      chime(CHIME_HZ.revealed);
      break;
    case 'task.atPin':
      buzz(BUZZ_ARRIVE_MS);
      chime(CHIME_HZ.atPin);
      break;
    case 'task.completed':
      chime(CHIME_HZ.done);
      break;
    case 'game.compromised':
      // Everyone hears it (the boxes are public), and nothing says who.
      buzz(BUZZ_COMPROMISED_MS);
      chime(CHIME_HZ.glitch, 'sawtooth');
      break;
    case 'infect.completed':
      buzz(BUZZ_EXPOSED_MS);
      chime(CHIME_HZ.exposed, 'triangle');
      break;
    case 'infect.failed':
      buzz(BUZZ_FAILED_MS);
      break;
    default:
      break;
  }
}

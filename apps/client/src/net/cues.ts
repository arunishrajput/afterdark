/**
 * Direction and event cues (UI_UX §3): so players don't stare at the screen while
 * walking, events buzz (Android: `navigator.vibrate`) and sound. The kit is in
 * `sounds.ts`; a mute toggle (remembered on the device) silences the sounds.
 */
import type { GameEvent } from '@afterdark/shared';
import { create } from 'zustand';

import { type HapticId, HAPTICS, type SoundId, SOUNDS } from './sounds';

const MUTE_KEY = 'afterdark.muted';

function readMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

interface SoundState {
  muted: boolean;
  setMuted: (muted: boolean) => void;
}

export const useSound = create<SoundState>()((set) => ({
  muted: readMuted(),
  setMuted: (muted) => {
    set({ muted });
    try {
      globalThis.localStorage?.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // blocked storage: the choice lasts until the page closes
    }
  },
}));

let audio: AudioContext | undefined;

/** Plays one sound from the kit, unless muted. Quietly does nothing where audio is blocked. */
export function playSound(id: SoundId): void {
  if (useSound.getState().muted) return;
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    for (const n of SOUNDS[id]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.wave;
      osc.frequency.value = n.hz;
      gain.gain.setValueAtTime(n.gain, t0 + n.at);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + n.at);
      osc.stop(t0 + n.at + n.dur);
    }
  } catch {
    // No audio (blocked by the browser or unsupported): the toast is the cue.
  }
}

export function buzz(pattern: readonly number[]): void {
  try {
    navigator.vibrate?.([...pattern]);
  } catch {
    // Not supported (iOS): ignore.
  }
}

export function haptic(id: HapticId): void {
  buzz(HAPTICS[id]);
}

/** Sound state for the mute toggle. */
export function useMuted(): [boolean, (muted: boolean) => void] {
  const muted = useSound((s) => s.muted);
  const setMuted = useSound((s) => s.setMuted);
  return [muted, setMuted];
}

/** Plays the cue for a server event, if it has one. */
export function playCue(event: GameEvent): void {
  switch (event.type) {
    case 'task.revealed':
      haptic('revealed');
      playSound('revealed');
      break;
    case 'task.atPin':
      haptic('atPin');
      playSound('atPin');
      break;
    case 'task.completed':
      playSound('success');
      break;
    case 'game.compromised':
      // Everyone hears it (the boxes are public), and nothing says who.
      haptic('compromised');
      playSound('compromised');
      break;
    case 'infect.completed':
      haptic('exposed');
      playSound('exposed');
      break;
    case 'infect.failed':
      haptic('fail');
      break;
    case 'sabotage.started':
      // Everyone hears it (the lock is public), and nothing says who.
      haptic('jammed');
      playSound('jammed');
      break;
    case 'meeting.called':
      // Everyone, imposters included, gets the same alarm (MEETINGS §3).
      haptic('meeting');
      playSound('meeting');
      break;
    default:
      break;
  }
}

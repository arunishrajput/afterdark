/**
 * The sound kit and the vibration patterns (PHASE-13 §13.4). Pure data: every
 * sound is a few notes made by WebAudio oscillators, so there are no files to
 * load. Imposter-only cues are quiet and short, so a glance or a listening
 * neighbour learns nothing. iOS has no vibration: the sound and the toast stay.
 */
export type OscWave = 'sine' | 'triangle' | 'square' | 'sawtooth';

export interface Note {
  hz: number;
  /** Seconds after the sound starts. */
  at: number;
  dur: number;
  wave: OscWave;
  /** Peak gain, 0 to 1 (the master level is applied on top). */
  gain: number;
}

const NORMAL_GAIN = 0.08;
const QUIET_GAIN = 0.03;

const note = (
  hz: number,
  at: number,
  dur = 0.16,
  wave: OscWave = 'sine',
  gain = NORMAL_GAIN,
): Note => ({
  hz,
  at,
  dur,
  wave,
  gain,
});

export const SOUNDS = {
  /** A pin was revealed. */
  revealed: [note(660, 0), note(880, 0.12)],
  /** The player is at the pin: Start is available. */
  atPin: [note(880, 0), note(1100, 0.12), note(880, 0.24)],
  /** A task was completed. */
  success: [note(784, 0), note(1047, 0.1), note(1319, 0.2, 0.22)],
  /** A wrong answer. */
  fail: [note(220, 0, 0.14, 'square'), note(165, 0.14, 0.2, 'square')],
  /** The task was a fake: a sad trombone. */
  fooled: [
    note(523, 0, 0.16, 'triangle'),
    note(440, 0.16, 0.16, 'triangle'),
    note(262, 0.32, 0.3, 'triangle'),
  ],
  /** An infection box filled (heard by everyone). */
  compromised: [note(180, 0, 0.14, 'sawtooth'), note(180, 0.2, 0.14, 'sawtooth')],
  /** A meeting was called (heard by everyone, imposters too). */
  meeting: [
    note(740, 0, 0.18, 'square'),
    note(740, 0.3, 0.18, 'square'),
    note(740, 0.6, 0.18, 'square'),
  ],
  /** Systems jammed (heard by everyone). */
  jammed: [note(140, 0, 0.3, 'square')],
  /** Imposter only: an infection landed. Quiet and short. */
  exposed: [note(520, 0, 0.08, 'triangle', QUIET_GAIN)],
} as const satisfies Record<string, readonly Note[]>;

export type SoundId = keyof typeof SOUNDS;

/** Sounds only an imposter hears: they must stay quiet and short. */
export const IMPOSTER_SOUNDS: readonly SoundId[] = ['exposed'];
export const IMPOSTER_MAX_GAIN = QUIET_GAIN;
export const IMPOSTER_MAX_S = 0.15;

export const HAPTICS = {
  revealed: [120, 60, 120],
  atPin: [200, 80, 200, 80, 300],
  fail: [100, 50, 100],
  compromised: [60, 40, 60, 40, 220],
  meeting: [400, 150, 400, 150, 600],
  jammed: [300, 80, 120, 80, 300],
  /** Imposter only, and short. */
  exposed: [120],
  infectStart: [80],
  infectGap: [60, 40, 60, 40, 60],
} as const satisfies Record<string, readonly number[]>;

export type HapticId = keyof typeof HAPTICS;

/** How long a sound lasts, in seconds. */
export function soundLength(id: SoundId): number {
  return Math.max(...SOUNDS[id].map((n) => n.at + n.dur));
}

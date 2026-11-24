import { describe, expect, it } from 'vitest';

import {
  HAPTICS,
  IMPOSTER_MAX_GAIN,
  IMPOSTER_MAX_S,
  IMPOSTER_SOUNDS,
  type SoundId,
  soundLength,
  SOUNDS,
} from './sounds';

describe('the sound kit', () => {
  it('has well-formed notes', () => {
    for (const notes of Object.values(SOUNDS)) {
      expect(notes.length).toBeGreaterThan(0);
      for (const n of notes) {
        expect(n.hz).toBeGreaterThan(20);
        expect(n.dur).toBeGreaterThan(0);
        expect(n.at).toBeGreaterThanOrEqual(0);
        expect(n.gain).toBeGreaterThan(0);
        expect(n.gain).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it('keeps imposter-only sounds quiet and short', () => {
    for (const id of IMPOSTER_SOUNDS) {
      expect(soundLength(id)).toBeLessThanOrEqual(IMPOSTER_MAX_S);
      for (const n of SOUNDS[id]) expect(n.gain).toBeLessThanOrEqual(IMPOSTER_MAX_GAIN);
    }
  });

  it('keeps every sound under two seconds', () => {
    for (const id of Object.keys(SOUNDS) as SoundId[]) expect(soundLength(id)).toBeLessThan(2);
  });
});

describe('the vibration patterns', () => {
  it('are non-empty numbers, and the imposter-only one is short', () => {
    for (const pattern of Object.values(HAPTICS)) {
      expect(pattern.length).toBeGreaterThan(0);
      for (const ms of pattern) expect(ms).toBeGreaterThan(0);
    }
    expect(HAPTICS.exposed.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(150);
  });
});

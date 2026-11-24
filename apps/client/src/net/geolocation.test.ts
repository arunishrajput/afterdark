import { describe, expect, it } from 'vitest';

import { wantsHighAccuracy } from './geolocation';

describe('wantsHighAccuracy', () => {
  it('relaxes only for a ready player waiting in the lobby with no countdown', () => {
    expect(wantsHighAccuracy('lobby', true, false)).toBe(false);
  });
  it('wants full GPS while setting up, once the countdown runs and in every game phase', () => {
    expect(wantsHighAccuracy('lobby', false, false)).toBe(true);
    expect(wantsHighAccuracy('lobby', true, true)).toBe(true);
    for (const phase of ['spawning', 'reveal', 'playing', 'ended', undefined]) {
      expect(wantsHighAccuracy(phase, true, false)).toBe(true);
    }
  });
});

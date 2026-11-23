import { describe, expect, it } from 'vitest';

import { formatClock, formatDistance } from './format';

describe('formatClock', () => {
  it.each([
    [0, '00:00'],
    [-500, '00:00'],
    [1, '00:01'],
    [999, '00:01'],
    [1000, '00:01'],
    [61_000, '01:01'],
    [25 * 60_000, '25:00'],
  ])('%i ms → %s', (ms, text) => expect(formatClock(ms)).toBe(text));
});

describe('formatDistance', () => {
  it('uses metres under a kilometre and km above', () => {
    expect(formatDistance(36.6)).toBe('37 m');
    expect(formatDistance(999)).toBe('999 m');
    expect(formatDistance(1250)).toBe('1.3 km');
  });
});

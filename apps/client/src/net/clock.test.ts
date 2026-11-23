import { describe, expect, it } from 'vitest';

import { bestEstimate, sampleFromPing } from './clock';

describe('sampleFromPing', () => {
  it('computes RTT and offset assuming a symmetric path', () => {
    // Sent at 1000, server stamped 5050, received at 1100 → rtt 100, midpoint 1050.
    expect(sampleFromPing(1000, 5050, 1100)).toEqual({ rttMs: 100, offsetMs: 4000 });
  });

  it('clamps negative RTT (clock adjusted mid-flight) to 0', () => {
    expect(sampleFromPing(1000, 1000, 990).rttMs).toBe(0);
  });
});

describe('bestEstimate', () => {
  it('returns undefined with no samples', () => {
    expect(bestEstimate([])).toBeUndefined();
  });

  it('prefers the lowest-RTT sample (least asymmetric error)', () => {
    const est = bestEstimate([
      { rttMs: 300, offsetMs: 900 },
      { rttMs: 40, offsetMs: 1000 },
      { rttMs: 120, offsetMs: 1100 },
    ]);
    expect(est).toEqual({ rttMs: 40, offsetMs: 1000 });
  });
});

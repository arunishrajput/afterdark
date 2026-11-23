import { describe, expect, it } from 'vitest';

import { bearingDeg, distanceM, offsetByMeters } from './distance';

const A = { lat: 28.6139, lng: 77.209 };

describe('distanceM', () => {
  it('is zero for the same point', () => {
    expect(distanceM(A, A)).toBe(0);
  });

  it('matches a known distance (Delhi → Jaipur ≈ 238 km)', () => {
    const jaipur = { lat: 26.9124, lng: 75.7873 };
    expect(distanceM(A, jaipur) / 1000).toBeGreaterThan(232);
    expect(distanceM(A, jaipur) / 1000).toBeLessThan(242);
  });

  it('is symmetric', () => {
    const b = { lat: 28.62, lng: 77.22 };
    expect(distanceM(A, b)).toBeCloseTo(distanceM(b, A), 6);
  });

  it('measures 0.001° of latitude as ≈ 111 m', () => {
    expect(distanceM(A, { lat: A.lat + 0.001, lng: A.lng })).toBeCloseTo(111.2, 0);
  });
});

describe('bearingDeg', () => {
  it('points the compass directions, normalised to [0, 360)', () => {
    expect(bearingDeg(A, { lat: A.lat + 0.01, lng: A.lng })).toBeCloseTo(0, 3);
    expect(bearingDeg(A, { lat: A.lat, lng: A.lng + 0.01 })).toBeCloseTo(90, 0);
    expect(bearingDeg(A, { lat: A.lat - 0.01, lng: A.lng })).toBeCloseTo(180, 3);
    const west = bearingDeg(A, { lat: A.lat, lng: A.lng - 0.01 });
    expect(west).toBeGreaterThan(269);
    expect(west).toBeLessThan(271);
  });
});

describe('offsetByMeters', () => {
  it('moves by the requested distance', () => {
    const p = offsetByMeters(A, 30, 40);
    expect(distanceM(A, p)).toBeCloseTo(50, 0);
    expect(p.lat).toBeGreaterThan(A.lat);
    expect(p.lng).toBeGreaterThan(A.lng);
  });
});

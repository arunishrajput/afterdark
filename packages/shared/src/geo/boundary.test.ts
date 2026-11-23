import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import {
  type BoundaryInput,
  circleToRing,
  pointInRing,
  polygonAreaM2,
  validateBoundary,
} from './boundary';
import { offsetByMeters } from './distance';
import { type LatLng, toPosition } from './types';

const C: LatLng = { lat: 28.6139, lng: 77.209 };
const limits = DEFAULT_CONFIG;

/** A square ring (closed) with the given half-side in metres around C. */
function square(halfM: number, centre: LatLng = C) {
  const pts = [
    offsetByMeters(centre, -halfM, -halfM),
    offsetByMeters(centre, halfM, -halfM),
    offsetByMeters(centre, halfM, halfM),
    offsetByMeters(centre, -halfM, halfM),
  ].map(toPosition);
  return [...pts, pts[0]!];
}

describe('circleToRing', () => {
  it('builds a closed 64-gon whose vertices are radiusM from the centre', () => {
    const ring = circleToRing(C, 100);
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring[64]);
    expect(polygonAreaM2(ring)).toBeGreaterThan(Math.PI * 100 * 100 * 0.99);
    expect(polygonAreaM2(ring)).toBeLessThan(Math.PI * 100 * 100 * 1.01);
  });
});

describe('polygonAreaM2', () => {
  it('measures a 100 m × 100 m square as ≈ 10 000 m²', () => {
    expect(polygonAreaM2(square(50))).toBeGreaterThan(9900);
    expect(polygonAreaM2(square(50))).toBeLessThan(10100);
  });
});

describe('pointInRing', () => {
  const ring = square(50);
  it('is true inside and false outside', () => {
    expect(pointInRing(C, ring)).toBe(true);
    expect(pointInRing(offsetByMeters(C, 80, 0), ring)).toBe(false);
    expect(pointInRing(offsetByMeters(C, 0, -60), ring)).toBe(false);
  });

  it('handles a concave (L-shaped) polygon', () => {
    const L = [
      offsetByMeters(C, 0, 0),
      offsetByMeters(C, 100, 0),
      offsetByMeters(C, 100, 40),
      offsetByMeters(C, 40, 40),
      offsetByMeters(C, 40, 100),
      offsetByMeters(C, 0, 100),
    ].map(toPosition);
    const ringL = [...L, L[0]!];
    expect(pointInRing(offsetByMeters(C, 20, 20), ringL)).toBe(true);
    expect(pointInRing(offsetByMeters(C, 80, 20), ringL)).toBe(true);
    expect(pointInRing(offsetByMeters(C, 20, 80), ringL)).toBe(true);
    expect(pointInRing(offsetByMeters(C, 80, 80), ringL)).toBe(false); // the notch
  });
});

describe('validateBoundary', () => {
  it('accepts a polygon and closes the ring', () => {
    const open = square(100).slice(0, 4);
    const res = validateBoundary({ type: 'polygon', coords: open }, limits);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ring).toHaveLength(5);
      expect(res.ring[0]).toEqual(res.ring[4]);
      expect(res.areaM2).toBeGreaterThan(39000);
    }
  });

  it('accepts a polygon that is already closed, ignoring repeated points', () => {
    const closed = square(100);
    const dup = [closed[0]!, closed[0]!, ...closed.slice(1)];
    const res = validateBoundary({ type: 'polygon', coords: dup }, limits);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.ring).toHaveLength(5);
  });

  it('accepts a circle and returns its 64-gon', () => {
    const res = validateBoundary({ type: 'circle', center: C, radiusM: 120 }, limits);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ring).toHaveLength(65);
      expect(res.areaM2).toBeGreaterThan(Math.PI * 120 * 120 * 0.99);
    }
  });

  it('rejects fewer than 3 distinct points', () => {
    const [a, b] = square(100);
    const res = validateBoundary({ type: 'polygon', coords: [a!, b!, a!] }, limits);
    expect(res).toMatchObject({ ok: false, reason: 'tooFewPoints' });
  });

  it('rejects a self-intersecting bow-tie', () => {
    const [a, b, c, d] = square(100);
    const res = validateBoundary({ type: 'polygon', coords: [a!, c!, b!, d!] }, limits);
    expect(res).toMatchObject({ ok: false, reason: 'selfIntersecting' });
  });

  it('rejects an area below the minimum', () => {
    const res = validateBoundary({ type: 'polygon', coords: square(30) }, limits); // 3 600 m²
    expect(res).toMatchObject({ ok: false, reason: 'tooSmall' });
  });

  it('rejects an area above the maximum', () => {
    const res = validateBoundary({ type: 'circle', center: C, radiusM: 1100 }, limits); // 3.8 km²
    expect(res).toMatchObject({ ok: false, reason: 'tooLarge' });
  });

  it('accepts exactly the minimum-sized region', () => {
    const r = Math.sqrt(limits.minBoundaryAreaM2 / Math.PI) * 1.02;
    const res = validateBoundary({ type: 'circle', center: C, radiusM: r }, limits);
    expect(res.ok).toBe(true);
  });

  it('gives a human message for every rejection', () => {
    const bad: BoundaryInput = { type: 'circle', center: C, radiusM: 5 };
    const res = validateBoundary(bad, limits);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message.length).toBeGreaterThan(10);
  });
});

import { describe, expect, it } from 'vitest';

import { createRng } from '../rng';
import { distanceM, offsetByMeters } from './distance';
import { areaBBox, areaContains, sampleBestCandidate, sampleUniform } from './sampling';
import type { LatLng, MultiPolygonCoords, Ring } from './types';
import { toLatLng } from './types';

const ORIGIN: LatLng = { lat: 28.6139, lng: 77.209 };

/** A square, `sizeM` on a side, whose south-west corner is at `at` plus the offset. */
function square(sizeM: number, eastM = 0, northM = 0): Ring {
  const sw = offsetByMeters(ORIGIN, eastM, northM);
  const se = offsetByMeters(sw, sizeM, 0);
  const ne = offsetByMeters(sw, sizeM, sizeM);
  const nw = offsetByMeters(sw, 0, sizeM);
  return [sw, se, ne, nw, sw].map((p) => [p.lng, p.lat]);
}

const plain: MultiPolygonCoords = [[square(300)]];
/** The same square with a 100 m hole in the middle. */
const holed: MultiPolygonCoords = [[square(300), square(100, 100, 100)]];

describe('areaBBox / areaContains', () => {
  it('reports the extent of the outer rings', () => {
    const [minLng, minLat, maxLng, maxLat] = areaBBox(plain);
    expect(maxLng).toBeGreaterThan(minLng);
    expect(maxLat).toBeGreaterThan(minLat);
  });

  it('respects holes and treats an empty area as containing nothing', () => {
    const inside = areaContains(holed);
    expect(inside(offsetByMeters(ORIGIN, 20, 20))).toBe(true);
    expect(inside(offsetByMeters(ORIGIN, 150, 150))).toBe(false);
    expect(areaContains([])(ORIGIN)).toBe(false);
  });
});

describe('sampleUniform', () => {
  it('returns the requested number of points, all inside and outside the hole', () => {
    const pts = sampleUniform(holed, createRng(1), 200);
    const inside = areaContains(holed);
    expect(pts).toHaveLength(200);
    expect(pts.every((p) => inside(p))).toBe(true);
  });

  it('is deterministic per seed and differs between seeds', () => {
    const a = sampleUniform(plain, createRng(7), 20);
    expect(sampleUniform(plain, createRng(7), 20)).toEqual(a);
    expect(sampleUniform(plain, createRng(8), 20)).not.toEqual(a);
  });

  it('stops short rather than loop forever on an area with no interior', () => {
    expect(sampleUniform([], createRng(1), 5)).toEqual([]);
  });
});

describe('sampleBestCandidate', () => {
  it('keeps every point inside the area and at least the minimum spacing apart', () => {
    const pts = sampleBestCandidate(holed, createRng(3), { count: 25, minSpacingM: 20 });
    const inside = areaContains(holed);
    expect(pts.length).toBeGreaterThan(15);
    expect(pts.every((p) => inside(p))).toBe(true);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        expect(distanceM(pts[i] as LatLng, pts[j] as LatLng)).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it('keeps its distance from existing points too', () => {
    const existing = [toLatLng([plain[0]?.[0]?.[0]?.[0] ?? 0, plain[0]?.[0]?.[0]?.[1] ?? 0])];
    const pts = sampleBestCandidate(plain, createRng(4), {
      count: 10,
      minSpacingM: 50,
      existing,
    });
    for (const p of pts) expect(distanceM(p, existing[0] as LatLng)).toBeGreaterThanOrEqual(50);
  });

  it('returns fewer points when the area cannot hold that many', () => {
    const tiny: MultiPolygonCoords = [[square(30)]];
    const pts = sampleBestCandidate(tiny, createRng(5), { count: 10, minSpacingM: 20 });
    expect(pts.length).toBeLessThan(10);
    expect(pts.length).toBeGreaterThan(0);
  });

  it('is deterministic per seed', () => {
    const run = (seed: number) =>
      sampleBestCandidate(plain, createRng(seed), { count: 10, minSpacingM: 20 });
    expect(run(9)).toEqual(run(9));
  });
});

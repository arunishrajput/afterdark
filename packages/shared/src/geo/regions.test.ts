import turfArea from '@turf/area';
import { multiPolygon } from '@turf/helpers';
import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import { polygonAreaM2 } from './boundary';
import { intersectAreas } from './plane';
import { partitionRegions, playableArea, resolveRegionCount } from './regions';
import { areaContains } from './sampling';
import { circleShape, cShape, lShape, ORIGIN, rectShape, ringFromMeters } from './testShapes';
import type { MultiPolygonCoords, Ring } from './types';

const areaOf = (mp: MultiPolygonCoords) => (mp.length === 0 ? 0 : turfArea(multiPolygon(mp)));

const SHAPES: [string, Ring, number][] = [
  ['circle', circleShape(250), 4],
  ['rectangle', rectShape(500, 300), 4],
  ['L-shape', lShape(), 3],
  ['concave C', cShape(), 3],
];

describe('resolveRegionCount', () => {
  const t = DEFAULT_CONFIG.regionCountAutoMaxAreaM2;
  it('follows the auto rule by area', () => {
    expect(resolveRegionCount('auto', 20_000, t)).toBe(2);
    expect(resolveRegionCount('auto', 40_000, t)).toBe(3);
    expect(resolveRegionCount('auto', 149_999, t)).toBe(3);
    expect(resolveRegionCount('auto', 300_000, t)).toBe(4);
    expect(resolveRegionCount('auto', 900_000, t)).toBe(5);
    expect(resolveRegionCount('auto', 2_000_000, t)).toBe(6);
  });
  it('uses a manual count as given', () => {
    expect(resolveRegionCount(5, 20_000, t)).toBe(5);
  });
});

describe('playableArea', () => {
  it('is the boundary minus the no-go zones', () => {
    const boundary = rectShape(400, 400);
    const zone = ringFromMeters([
      [100, 100],
      [200, 100],
      [200, 200],
      [100, 200],
    ]);
    const area = playableArea(boundary, [zone]);
    expect(areaOf(area)).toBeCloseTo(polygonAreaM2(boundary) - polygonAreaM2(zone), -1);
    expect(playableArea(boundary, [])).toEqual([[boundary]]);
  });
});

describe.each(SHAPES)('partitionRegions on a %s', (_name, ring, k) => {
  const domain: MultiPolygonCoords = [[ring]];
  const regions = partitionRegions(domain, k, 42, DEFAULT_CONFIG);

  it('makes the requested number of regions, named in reading order', () => {
    expect(regions.length).toBeGreaterThanOrEqual(2);
    expect(regions.length).toBeLessThanOrEqual(k);
    expect(regions.map((r) => r.name)).toEqual(
      regions.map((_, i) => `Region ${String.fromCharCode(65 + i)}`),
    );
    expect(new Set(regions.map((r) => r.id)).size).toBe(regions.length);
  });

  it('never overlaps', () => {
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        const overlap = areaOf(intersectAreas(regions[i]?.area ?? [], regions[j]?.area ?? []));
        expect(overlap).toBeLessThan(2); // m²: clipping dust only
      }
    }
  });

  it('covers the whole boundary', () => {
    const total = regions.reduce((sum, r) => sum + areaOf(r.area), 0);
    expect(Math.abs(total - polygonAreaM2(ring)) / polygonAreaM2(ring)).toBeLessThan(0.01);
  });

  it('is deterministic for a seed and varies between seeds', () => {
    expect(partitionRegions(domain, k, 42, DEFAULT_CONFIG)).toEqual(regions);
    const other = partitionRegions(domain, k, 43, DEFAULT_CONFIG);
    expect(other).not.toEqual(regions);
  });
});

describe('partitionRegions with no-go zones', () => {
  const boundary = rectShape(500, 500);
  const road = ringFromMeters([
    [200, -10],
    [240, -10],
    [240, 510],
    [200, 510],
  ]);
  const domain = playableArea(boundary, [road]);
  const regions = partitionRegions(domain, 3, 5, DEFAULT_CONFIG);

  it('covers the boundary minus the no-go area, within 1%', () => {
    const total = regions.reduce((sum, r) => sum + areaOf(r.area), 0);
    const expected = areaOf(domain);
    expect(Math.abs(total - expected) / expected).toBeLessThan(0.01);
  });

  it('keeps no-go ground out of every region', () => {
    const inRoad = {
      lat: ORIGIN.lat + 250 / 111_320,
      lng: ORIGIN.lng + 220 / (111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180)),
    };
    for (const r of regions) expect(areaContains(r.area)(inRoad)).toBe(false);
  });
});

describe('partitionRegions edge cases', () => {
  it('re-runs with fewer regions when one would be tiny, and never below two', () => {
    const sliver = partitionRegions([[rectShape(900, 60)]], 6, 1, DEFAULT_CONFIG);
    expect(sliver.length).toBeGreaterThanOrEqual(2);
    const sizes = sliver.map((r) => r.areaM2);
    const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    if (sliver.length > 2) {
      for (const s of sizes)
        expect(s).toBeGreaterThanOrEqual(DEFAULT_CONFIG.minRegionAreaRatio * avg);
    }
  });
});

import turfArea from '@turf/area';
import { multiPolygon } from '@turf/helpers';
import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import { createRng } from '../rng';
import { distanceM, offsetByMeters } from './distance';
import { partitionRegions } from './regions';
import { areaContains, sampleUniform } from './sampling';
import {
  compassSectionOf,
  frameRegion,
  type Region,
  SECTION_IDS,
  sectionInFrame,
  sectionOf,
  sectionShapes,
} from './sections';
import { circleShape, cShape, lShape, ORIGIN, rectShape, ringFromMeters } from './testShapes';
import type { LatLng } from './types';

const RATIO = DEFAULT_CONFIG.sectionCentreRatio;

/** A square region `size` m wide whose south-west corner is `east`/`north` metres from ORIGIN. */
function squareRegion(id: string, size: number, east: number, north: number): Region {
  const area = [
    [
      ringFromMeters([
        [east, north],
        [east + size, north],
        [east + size, north + size],
        [east, north + size],
      ]),
    ],
  ];
  return frameRegion({ id, name: id, area, areaM2: size * size });
}

describe('compassSectionOf', () => {
  it('places every 45° arc, with borders on the clockwise side', () => {
    const cases: [number, string][] = [
      [0, 'N'],
      [22.4999, 'N'],
      [22.5, 'NE'],
      [45, 'NE'],
      [67.4999, 'NE'],
      [67.5, 'E'],
      [90, 'E'],
      [112.5, 'SE'],
      [157.5, 'S'],
      [180, 'S'],
      [202.5, 'SW'],
      [247.5, 'W'],
      [292.5, 'NW'],
      [337.4999, 'NW'],
      [337.5, 'N'],
      [359.9999, 'N'],
      [360, 'N'],
      [-45, 'NW'],
      [405, 'NE'],
    ];
    for (const [bearing, section] of cases)
      expect(compassSectionOf(bearing), `${bearing}°`).toBe(section);
  });
});

describe('frameRegion', () => {
  it('puts the origin at the pole of inaccessibility, and ρ at the furthest vertex', () => {
    const r = squareRegion('a', 200, 0, 0);
    const centre = offsetByMeters(ORIGIN, 100, 100);
    expect(distanceM(r.origin, centre)).toBeLessThan(2);
    expect(r.rhoM).toBeGreaterThan(139);
    expect(r.rhoM).toBeLessThan(144); // 100·√2 ≈ 141.4
  });

  it('keeps the origin inside a concave region', () => {
    const regions = partitionRegions([[cShape()]], 2, 3, DEFAULT_CONFIG).map(frameRegion);
    expect(regions.length).toBeGreaterThan(1);
    for (const region of regions) {
      expect(areaContains(region.area)(region.origin)).toBe(true);
      expect(region.rhoM).toBeGreaterThan(0);
    }
    const l = frameRegion({ id: 'l', name: 'l', area: [[lShape()]], areaM2: 120_000 });
    expect(areaContains(l.area)(l.origin)).toBe(true);
  });
});

describe('sectionOf: each region has its own compass', () => {
  // Region A sits in the south-west of the whole boundary, Region B in the north-east.
  const a = squareRegion('A', 200, 0, 0);
  const b = squareRegion('B', 200, 300, 300);
  const regions = [a, b];

  it('a point due NE of A is NE of A even where it is in the global SW of the boundary', () => {
    const p = offsetByMeters(a.origin, 60, 60); // bearing ≈ 45°, beyond the centre radius
    const boundaryCentre = offsetByMeters(ORIGIN, 250, 250);
    expect(p.lng).toBeLessThan(boundaryCentre.lng);
    expect(p.lat).toBeLessThan(boundaryCentre.lat);
    expect(sectionOf(p, regions, RATIO)).toEqual({ regionId: 'A', section: 'NE' });
  });

  it('uses each region’s own origin: the same offset from B is also NE, of B', () => {
    expect(sectionOf(offsetByMeters(b.origin, 60, 60), regions, RATIO)).toEqual({
      regionId: 'B',
      section: 'NE',
    });
    expect(sectionOf(offsetByMeters(b.origin, -60, -60), regions, RATIO)).toEqual({
      regionId: 'B',
      section: 'SW',
    });
  });

  it('puts all 8 compass directions and the centre in the right section', () => {
    const dirs: [number, number, string][] = [
      [0, 70, 'N'],
      [50, 50, 'NE'],
      [70, 0, 'E'],
      [50, -50, 'SE'],
      [0, -70, 'S'],
      [-50, -50, 'SW'],
      [-70, 0, 'W'],
      [-50, 50, 'NW'],
    ];
    for (const [e, n, section] of dirs) {
      expect(sectionOf(offsetByMeters(a.origin, e, n), regions, RATIO)?.section, section).toBe(
        section,
      );
    }
    expect(sectionOf(a.origin, regions, RATIO)?.section).toBe('C');
  });

  it('has a centre of 0.35ρ', () => {
    const inside = (frac: number) =>
      sectionInFrame(offsetByMeters(a.origin, frac * a.rhoM, 0), a, RATIO);
    expect(inside(0.34)).toBe('C');
    expect(inside(0.36)).toBe('E');
  });

  it('is null outside every region, and favours the earlier region on a shared edge', () => {
    expect(sectionOf(offsetByMeters(ORIGIN, 250, 250), regions, RATIO)).toBeNull();
    const left = squareRegion('L', 100, 0, 0);
    const right = squareRegion('R', 100, 100, 0);
    const onEdge = offsetByMeters(ORIGIN, 100, 50);
    expect(sectionOf(onEdge, [left, right], RATIO)?.regionId).toBe('L');
    expect(sectionOf(onEdge, [right, left], RATIO)?.regionId).toBe('R');
  });
});

describe('sectionShapes', () => {
  const shapes: [string, Region][] = [
    ['square', squareRegion('s', 300, 0, 0)],
    ['circle', frameRegion({ id: 'c', name: 'c', area: [[circleShape(200)]], areaM2: 125_000 })],
    ['L-shape', frameRegion({ id: 'l', name: 'l', area: [[lShape()]], areaM2: 120_000 })],
    ['concave C', frameRegion({ id: 'k', name: 'k', area: [[cShape()]], areaM2: 110_000 })],
    [
      'rectangle',
      frameRegion({ id: 'r', name: 'r', area: [[rectShape(500, 150)]], areaM2: 75_000 }),
    ],
  ];

  it.each(shapes)(
    '%s: the 9 sections add up to the region and agree with sectionOf',
    (_n, region) => {
      const sections = sectionShapes(region, RATIO);
      expect(sections.map((s) => s.id)).toEqual([...SECTION_IDS]);
      const total = sections.reduce((sum, s) => sum + s.areaM2, 0);
      const regionArea = turfArea(multiPolygon(region.area));
      expect(Math.abs(total - regionArea) / regionArea).toBeLessThan(0.01);

      // Points well away from every border land in the polygon of the section sectionOf names.
      const contains = new Map(sections.map((s) => [s.id, areaContains(s.area)]));
      const pts: LatLng[] = sampleUniform(region.area, createRng(11), 300);
      let checked = 0;
      for (const p of pts) {
        const section = sectionInFrame(p, region, RATIO);
        const d = distanceM(region.origin, p);
        const margin = Math.abs(d - RATIO * region.rhoM);
        if (section !== 'C' && margin < 3) continue;
        if (section === 'C' && margin < 3) continue;
        checked++;
        if (section !== 'C') {
          // Skip points within ~1.5° of a wedge border: the plane and sphere bearings differ slightly.
          const b = ((compassBearing(region.origin, p) % 45) + 45) % 45;
          if (Math.abs(b - 22.5) < 1.5) continue;
        }
        expect(contains.get(section)?.(p), `${section} at d=${Math.round(d)}`).toBe(true);
      }
      expect(checked).toBeGreaterThan(100);
    },
  );

  it('flags a section too small to use by its area', () => {
    const tiny = squareRegion('t', 30, 0, 0); // 900 m² split nine ways
    const small = sectionShapes(tiny, RATIO).filter(
      (s) => s.areaM2 < DEFAULT_CONFIG.minSectionAreaM2,
    );
    expect(small.length).toBeGreaterThan(0);
  });
});

/** Bearing in degrees [0, 360) — a local copy so the test does not depend on the code under test. */
function compassBearing(from: LatLng, to: LatLng): number {
  const dE = (to.lng - from.lng) * Math.cos((from.lat * Math.PI) / 180);
  const dN = to.lat - from.lat;
  return ((Math.atan2(dE, dN) * 180) / Math.PI + 360) % 360;
}

describe('odd shapes (a no-go zone can punch holes or split a region)', () => {
  const outer = rectShape(300, 300);
  const hole = ringFromMeters([
    [100, 100],
    [200, 100],
    [200, 200],
    [100, 200],
  ]);

  it('a region with a hole: the origin is in the ring of ground, and the hole belongs to no section', () => {
    const donut = frameRegion({ id: 'd', name: 'd', area: [[outer, hole]], areaM2: 80_000 });
    expect(areaContains(donut.area)(donut.origin)).toBe(true);
    const middle = offsetByMeters(ORIGIN, 150, 150);
    expect(sectionOf(middle, [donut], RATIO)).toBeNull();
    const shapes = sectionShapes(donut, RATIO);
    const total = shapes.reduce((sum, sh) => sum + sh.areaM2, 0);
    // ≈ 300² − 100² (planar m², so within a percent or two of the geodesic figure)
    expect(total).toBeGreaterThan(79_000);
    expect(total).toBeLessThan(81_500);
    expect(sectionOf(offsetByMeters(ORIGIN, 20, 20), [donut], RATIO)).not.toBeNull();
  });

  it('a region cut in two parts: both parts are placed relative to the one origin', () => {
    const west = ringFromMeters([
      [0, 0],
      [100, 0],
      [100, 300],
      [0, 300],
    ]);
    const east = ringFromMeters([
      [200, 0],
      [300, 0],
      [300, 300],
      [200, 300],
    ]);
    const split = frameRegion({ id: 's', name: 's', area: [[west], [east]], areaM2: 60_000 });
    expect(areaContains(split.area)(split.origin)).toBe(true);
    const inWest = offsetByMeters(ORIGIN, 50, 150);
    const inEast = offsetByMeters(ORIGIN, 250, 150);
    const a = sectionOf(inWest, [split], RATIO);
    const b = sectionOf(inEast, [split], RATIO);
    expect(a?.regionId).toBe('s');
    expect(b?.regionId).toBe('s');
    expect(sectionOf(offsetByMeters(ORIGIN, 150, 150), [split], RATIO)).toBeNull(); // the gap
    // ρ reaches the far part's far corner.
    expect(split.rhoM).toBeGreaterThan(
      distanceM(split.origin, offsetByMeters(ORIGIN, 300, 300)) - 1,
    );
  });

  it('a very thin region still gets a frame with a usable origin', () => {
    const strip = frameRegion({ id: 't', name: 't', area: [[rectShape(600, 12)]], areaM2: 7200 });
    expect(areaContains(strip.area)(strip.origin)).toBe(true);
    expect(strip.rhoM).toBeGreaterThan(290);
    // Along the strip the compass says E / W, far from the centre disc.
    expect(sectionInFrame(offsetByMeters(strip.origin, 200, 0), strip, RATIO)).toBe('E');
    expect(sectionInFrame(offsetByMeters(strip.origin, -200, 0), strip, RATIO)).toBe('W');
  });
});

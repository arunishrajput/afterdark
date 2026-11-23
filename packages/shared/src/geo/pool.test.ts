import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import { createRng } from '../rng';
import { distanceM } from './distance';
import { generateAutoPoints, type RegionSections, sectionBigEnough, type TaskPoint } from './pool';
import { partitionRegions } from './regions';
import { frameRegion, sectionOf, sectionShapes } from './sections';
import { circleShape, lShape, rectShape } from './testShapes';
import type { Ring } from './types';

function build(ring: Ring, k: number, seed = 1): RegionSections[] {
  return partitionRegions([[ring]], k, seed, DEFAULT_CONFIG)
    .map(frameRegion)
    .map((region) => ({
      region,
      shapes: sectionShapes(region, DEFAULT_CONFIG.sectionCentreRatio),
    }));
}

function counter() {
  let n = 0;
  return () => `p${++n}`;
}

describe('generateAutoPoints', () => {
  const sections = build(circleShape(250), 4);
  const pool = generateAutoPoints(sections, createRng(5), DEFAULT_CONFIG, [], counter());

  it('puts at most taskPointsPerSection in each usable section and none in small ones', () => {
    const perSection = new Map<string, number>();
    for (const p of pool) {
      const key = `${p.regionId}:${p.section}`;
      perSection.set(key, (perSection.get(key) ?? 0) + 1);
    }
    for (const n of perSection.values()) {
      expect(n).toBeLessThanOrEqual(DEFAULT_CONFIG.taskPointsPerSection + 1); // +1: border points reassigned
    }
    for (const { region, shapes } of sections) {
      for (const shape of shapes) {
        if (!sectionBigEnough(shape.areaM2, DEFAULT_CONFIG)) {
          expect(pool.some((p) => p.regionId === region.id && p.section === shape.id)).toBe(false);
        }
      }
    }
    expect(pool.length).toBeGreaterThan(sections.length * 5);
  });

  it('keeps every point at least taskPointMinSpacingM from every other', () => {
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        expect(distanceM(pool[i] as TaskPoint, pool[j] as TaskPoint)).toBeGreaterThanOrEqual(
          DEFAULT_CONFIG.taskPointMinSpacingM,
        );
      }
    }
  });

  it('labels each point with the region and section the server computes for it', () => {
    for (const p of pool) {
      expect(
        sectionOf(
          p,
          sections.map((s) => s.region),
          DEFAULT_CONFIG.sectionCentreRatio,
        ),
      ).toEqual({
        regionId: p.regionId,
        section: p.section,
      });
      expect(p.source).toBe('auto');
      expect(p.disabled).toBe(false);
    }
  });

  it('gives unique ids and is deterministic per seed', () => {
    expect(new Set(pool.map((p) => p.id)).size).toBe(pool.length);
    const again = generateAutoPoints(sections, createRng(5), DEFAULT_CONFIG, [], counter());
    expect(again).toEqual(pool);
    const other = generateAutoPoints(sections, createRng(6), DEFAULT_CONFIG, [], counter());
    expect(other).not.toEqual(pool);
  });

  it('keeps its distance from host points it was told to keep', () => {
    const host: TaskPoint = {
      id: 'h1',
      lat: pool[0]?.lat ?? 0,
      lng: pool[0]?.lng ?? 0,
      regionId: pool[0]?.regionId ?? '',
      section: pool[0]?.section ?? 'C',
      source: 'host',
      disabled: false,
    };
    const next = generateAutoPoints(sections, createRng(5), DEFAULT_CONFIG, [host], counter());
    for (const p of next) {
      expect(distanceM(p, host)).toBeGreaterThanOrEqual(DEFAULT_CONFIG.taskPointMinSpacingM);
    }
  });

  it.each([
    ['rectangle', rectShape(500, 300)],
    ['L-shape', lShape()],
  ])('works on a %s', (_n, ring) => {
    const s = build(ring, 3);
    const pts = generateAutoPoints(s, createRng(2), DEFAULT_CONFIG, [], counter());
    expect(pts.length).toBeGreaterThan(10);
  });
});

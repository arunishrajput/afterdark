/**
 * Seeded point sampling inside an area (MAP_AND_REGIONS §2, §4, §5). The area is
 * multi-polygon coordinates, so holes (no-go zones) are respected. Deterministic
 * for a given `Rng`, which is how the server reproduces a setup from its seed.
 */
import turfPointInPolygon from '@turf/boolean-point-in-polygon';
import { multiPolygon as turfMultiPolygon } from '@turf/helpers';

import type { Rng } from '../rng';
import { distanceM } from './distance';
import { type LatLng, type MultiPolygonCoords, toPosition } from './types';

/** Random candidates drawn per round of best-candidate sampling (Mitchell's algorithm). */
const CANDIDATES_PER_ROUND = 12;
/** Rounds without an acceptable point before sampling stops early. */
const MAX_FAILED_ROUNDS = 25;
/** Rejection sampling gives up after this many tries per requested point. */
const ATTEMPTS_PER_POINT = 200;

export type BBox = readonly [minLng: number, minLat: number, maxLng: number, maxLat: number];

export function areaBBox(area: MultiPolygonCoords): BBox {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const poly of area) {
    for (const [lng, lat] of poly[0] ?? []) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  return [minLng, minLat, maxLng, maxLat];
}

/** A containment test for an area. Points on an edge count as inside. */
export function areaContains(area: MultiPolygonCoords): (p: LatLng) => boolean {
  if (area.length === 0) return () => false;
  const feature = turfMultiPolygon(area);
  return (p) => turfPointInPolygon(toPosition(p), feature, { ignoreBoundary: false });
}

/** One uniformly random point of the area by rejection over its bounding box, or `undefined` if none was found. */
function drawOne(
  bbox: BBox,
  contains: (p: LatLng) => boolean,
  rng: Rng,
  attempts: number,
): LatLng | undefined {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  for (let i = 0; i < attempts; i++) {
    const p = {
      lng: minLng + rng.next() * (maxLng - minLng),
      lat: minLat + rng.next() * (maxLat - minLat),
    };
    if (contains(p)) return p;
  }
  return undefined;
}

/** Up to `count` uniformly random points inside the area (fewer only if the area is degenerate). */
export function sampleUniform(area: MultiPolygonCoords, rng: Rng, count: number): LatLng[] {
  const bbox = areaBBox(area);
  const contains = areaContains(area);
  const out: LatLng[] = [];
  for (let i = 0; i < count; i++) {
    const p = drawOne(bbox, contains, rng, ATTEMPTS_PER_POINT);
    if (!p) break;
    out.push(p);
  }
  return out;
}

export interface BestCandidateOptions {
  count: number;
  /** Hard minimum distance between any two points, including `existing` ones. */
  minSpacingM: number;
  /** Points already placed (e.g. host points). They constrain the spacing but are not returned. */
  existing?: readonly LatLng[];
}

function nearestM(p: LatLng, others: readonly LatLng[]): number {
  let best = Infinity;
  for (const o of others) best = Math.min(best, distanceM(p, o));
  return best;
}

/**
 * Best-candidate sampling: each new point is the one of several random candidates
 * that is furthest from the points already chosen, which spreads points evenly.
 * A point closer than `minSpacingM` to another is never accepted, so fewer than
 * `count` points come back when the area is too small to fit them.
 */
export function sampleBestCandidate(
  area: MultiPolygonCoords,
  rng: Rng,
  { count, minSpacingM, existing = [] }: BestCandidateOptions,
): LatLng[] {
  const bbox = areaBBox(area);
  const contains = areaContains(area);
  const placed: LatLng[] = [...existing];
  const out: LatLng[] = [];
  let failedRounds = 0;
  while (out.length < count && failedRounds < MAX_FAILED_ROUNDS) {
    let best: LatLng | undefined;
    let bestGap = -Infinity;
    for (let c = 0; c < CANDIDATES_PER_ROUND; c++) {
      const p = drawOne(bbox, contains, rng, ATTEMPTS_PER_POINT);
      if (!p) break;
      const gap = nearestM(p, placed);
      if (gap > bestGap) {
        best = p;
        bestGap = gap;
      }
    }
    if (best && bestGap >= minSpacingM) {
      out.push(best);
      placed.push(best);
      failedRounds = 0;
    } else {
      failedRounds++;
    }
  }
  return out;
}

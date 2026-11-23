/** The playable boundary: shapes, validation and containment (MAP_AND_REGIONS §1). */
import turfArea from '@turf/area';
import turfPointInPolygon from '@turf/boolean-point-in-polygon';
import turfCircle from '@turf/circle';
import { polygon as turfPolygon } from '@turf/helpers';
import turfKinks from '@turf/kinks';

import type { GameConfig } from '../config/schema';
import { type LatLng, type Position, toPosition } from './types';

const CIRCLE_STEPS = 64;
const M_PER_KM = 1000;

/** What the host sends: a polygon ring or a circle (turned into a 64-gon on the server). */
export type BoundaryInput =
  { type: 'polygon'; coords: Position[] } | { type: 'circle'; center: LatLng; radiusM: number };

export type BoundaryRejection = 'tooFewPoints' | 'selfIntersecting' | 'tooSmall' | 'tooLarge';

export type BoundaryResult =
  | { ok: true; ring: Position[]; areaM2: number }
  | { ok: false; reason: BoundaryRejection; message: string };

/** A closed ring (first = last) approximating a circle with 64 sides. */
export function circleToRing(center: LatLng, radiusM: number): Position[] {
  const feature = turfCircle(toPosition(center), radiusM / M_PER_KM, {
    steps: CIRCLE_STEPS,
    units: 'kilometers',
  });
  return feature.geometry.coordinates[0] as Position[];
}

function asPolygon(ring: Position[]) {
  return turfPolygon([ring]);
}

export function polygonAreaM2(ring: Position[]): number {
  return turfArea(asPolygon(ring));
}

/** Is `p` inside the closed `ring`? Points exactly on the edge count as inside. */
export function pointInRing(p: LatLng, ring: Position[]): boolean {
  return turfPointInPolygon(toPosition(p), asPolygon(ring), { ignoreBoundary: false });
}

/** Drops consecutive duplicates and the closing point, so a ring is its distinct vertices. */
export function distinctVertices(coords: Position[]): Position[] {
  const out: Position[] = [];
  for (const c of coords) {
    const prev = out.at(-1);
    if (!prev || prev[0] !== c[0] || prev[1] !== c[1]) out.push(c);
  }
  const first = out[0];
  const last = out.at(-1);
  if (out.length > 1 && first && last && first[0] === last[0] && first[1] === last[1]) out.pop();
  return out;
}

const fmtM2 = (m2: number) => `${Math.round(m2).toLocaleString('en-US')} m²`;

export function validateBoundary(
  input: BoundaryInput,
  limits: Pick<GameConfig, 'minBoundaryAreaM2' | 'maxBoundaryAreaM2'>,
): BoundaryResult {
  const vertices =
    input.type === 'circle'
      ? distinctVertices(circleToRing(input.center, input.radiusM))
      : distinctVertices(input.coords);
  if (vertices.length < 3) {
    return { ok: false, reason: 'tooFewPoints', message: 'A boundary needs at least 3 corners.' };
  }
  const ring: Position[] = [...vertices, vertices[0] as Position];
  if (turfKinks(asPolygon(ring)).features.length > 0) {
    return {
      ok: false,
      reason: 'selfIntersecting',
      message: 'The boundary crosses itself. Redraw it as one simple shape.',
    };
  }
  const areaM2 = polygonAreaM2(ring);
  if (areaM2 < limits.minBoundaryAreaM2) {
    return {
      ok: false,
      reason: 'tooSmall',
      message: `Too small (${fmtM2(areaM2)}). The area must be at least ${fmtM2(limits.minBoundaryAreaM2)}.`,
    };
  }
  if (areaM2 > limits.maxBoundaryAreaM2) {
    return {
      ok: false,
      reason: 'tooLarge',
      message: `Too large (${fmtM2(areaM2)}). The area must be at most ${fmtM2(limits.maxBoundaryAreaM2)}.`,
    };
  }
  return { ok: true, ring, areaM2 };
}

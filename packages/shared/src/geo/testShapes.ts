/** Boundary shapes shared by the geometry tests (not exported from the package). */
import { circleToRing } from './boundary';
import { offsetByMeters } from './distance';
import type { LatLng, Ring } from './types';

export const ORIGIN: LatLng = { lat: 28.6139, lng: 77.209 };

/** A closed ring through points given as metres east/north of `ORIGIN`. */
export function ringFromMeters(points: readonly (readonly [number, number])[]): Ring {
  const ring = points.map(([e, n]) => {
    const p = offsetByMeters(ORIGIN, e, n);
    return [p.lng, p.lat] as [number, number];
  });
  return [...ring, ring[0] as [number, number]];
}

export const circleShape = (radiusM: number): Ring => circleToRing(ORIGIN, radiusM);

export const rectShape = (w: number, h: number): Ring =>
  ringFromMeters([
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ]);

/** An L: 400 × 400 m with the top-right 200 × 200 m cut away. */
export const lShape = (): Ring =>
  ringFromMeters([
    [0, 0],
    [400, 0],
    [400, 200],
    [200, 200],
    [200, 400],
    [0, 400],
  ]);

/** A concave "C": 400 × 400 m with a 250 × 200 m bite taken out of the right side. */
export const cShape = (): Ring =>
  ringFromMeters([
    [0, 0],
    [400, 0],
    [400, 100],
    [150, 100],
    [150, 300],
    [400, 300],
    [400, 400],
    [0, 400],
  ]);

/**
 * A local flat plane for geometry that needs planar maths (k-means, Voronoi,
 * polygon clipping). x runs east and y north, both in metres, from a reference
 * point. The map is linear, so straight edges stay straight and area ratios hold;
 * over a few kilometres the error against the true sphere is negligible.
 */
import turfDifference from '@turf/difference';
import { featureCollection, multiPolygon } from '@turf/helpers';
import turfIntersect from '@turf/intersect';
import turfUnion from '@turf/union';

import { M_PER_DEG_LAT } from './distance';
import type { LatLng, MultiPolygonCoords, Position, Ring } from './types';

const DEG_TO_RAD = Math.PI / 180;
/** Rings with fewer positions than this cannot enclose an area. */
const MIN_RING_POSITIONS = 4;

export interface Plane {
  toXY: (p: Position) => Position;
  toLngLat: (p: Position) => Position;
}

export function planeAt(origin: LatLng): Plane {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos(origin.lat * DEG_TO_RAD);
  return {
    toXY: ([lng, lat]) => [(lng - origin.lng) * mPerDegLng, (lat - origin.lat) * M_PER_DEG_LAT],
    toLngLat: ([x, y]) => [origin.lng + x / mPerDegLng, origin.lat + y / M_PER_DEG_LAT],
  };
}

export function mapArea(
  area: MultiPolygonCoords,
  f: (p: Position) => Position,
): MultiPolygonCoords {
  return area.map((poly) => poly.map((ring) => ring.map(f)));
}

/** Signed shoelace area of a ring in the units of its coordinates, squared. */
function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i] as Position;
    const [x2, y2] = ring[i + 1] as Position;
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** Area of planar coordinates: outer rings minus holes. Use on `Plane` (metre) coordinates. */
export function planarArea(area: MultiPolygonCoords): number {
  let total = 0;
  for (const poly of area) {
    poly.forEach((ring, i) => {
      total += (i === 0 ? 1 : -1) * Math.abs(ringArea(ring));
    });
  }
  return total;
}

/** Area-weighted centroid of the outer rings (holes are ignored: good enough to order regions). */
export function planarCentroid(area: MultiPolygonCoords): Position {
  let cx = 0;
  let cy = 0;
  let total = 0;
  for (const poly of area) {
    const ring = poly[0];
    if (!ring) continue;
    // Orient every outer ring the same way so parts add up instead of cancelling.
    const sign = ringArea(ring) < 0 ? -1 : 1;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i] as Position;
      const [x2, y2] = ring[i + 1] as Position;
      const cross = (x1 * y2 - x2 * y1) * sign;
      cx += (x1 + x2) * cross;
      cy += (y1 + y2) * cross;
      total += cross / 2;
    }
  }
  if (total === 0) return area[0]?.[0]?.[0] ?? [0, 0];
  return [cx / (6 * total), cy / (6 * total)];
}

/** Drops degenerate rings (and polygons whose outer ring is degenerate). */
function clean(area: MultiPolygonCoords): MultiPolygonCoords {
  return area
    .map((poly) => poly.filter((ring) => ring.length >= MIN_RING_POSITIONS))
    .filter((poly) => poly.length > 0 && (poly[0]?.length ?? 0) >= MIN_RING_POSITIONS);
}

type Clipped = ReturnType<typeof turfIntersect>;

function toArea(result: Clipped): MultiPolygonCoords {
  if (!result) return [];
  const { geometry } = result;
  const coords = (
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  ) as MultiPolygonCoords;
  return clean(coords);
}

export function intersectAreas(a: MultiPolygonCoords, b: MultiPolygonCoords): MultiPolygonCoords {
  const [ca, cb] = [clean(a), clean(b)];
  if (ca.length === 0 || cb.length === 0) return [];
  return toArea(turfIntersect(featureCollection([multiPolygon(ca), multiPolygon(cb)])));
}

export function differenceAreas(a: MultiPolygonCoords, b: MultiPolygonCoords): MultiPolygonCoords {
  const [ca, cb] = [clean(a), clean(b)];
  if (ca.length === 0) return [];
  if (cb.length === 0) return ca;
  return toArea(turfDifference(featureCollection([multiPolygon(ca), multiPolygon(cb)])));
}

export function unionAreas(a: MultiPolygonCoords, b: MultiPolygonCoords): MultiPolygonCoords {
  const [ca, cb] = [clean(a), clean(b)];
  if (ca.length === 0) return cb;
  if (cb.length === 0) return ca;
  return toArea(turfUnion(featureCollection([multiPolygon(ca), multiPolygon(cb)])));
}

/** Union of many areas (empty list → empty area). */
export function unionAll(areas: readonly MultiPolygonCoords[]): MultiPolygonCoords {
  return areas.reduce<MultiPolygonCoords>((acc, a) => unionAreas(acc, a), []);
}

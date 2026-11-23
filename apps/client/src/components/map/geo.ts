/** Small conversions between Leaflet and the protocol's `[lng, lat]` rings. */
import type { LatLng, MultiPolygonCoords, Position } from '@afterdark/shared';
import type L from 'leaflet';

/** Leaflet wants `[lat, lng]`. The ring's closing point is dropped (Leaflet closes polygons itself). */
export function ringToLatLngs(ring: readonly Position[]): [number, number][] {
  return ring.slice(0, -1).map(([lng, lat]) => [lat, lng]);
}

export function latLngsToCoords(points: readonly L.LatLng[]): Position[] {
  return points.map((p) => [p.lng, p.lat]);
}

const SAME_VERTEX_EPS = 1e-9;

/** Do two rings have the same corners (ignoring the closing point and tiny float noise)? */
export function sameCorners(a: readonly Position[], b: readonly Position[]): boolean {
  const open = (r: readonly Position[]) => {
    const first = r[0];
    const last = r.at(-1);
    return r.length > 1 && first && last && first[0] === last[0] && first[1] === last[1]
      ? r.slice(0, -1)
      : r;
  };
  const x = open(a);
  const y = open(b);
  return (
    x.length === y.length &&
    x.every(
      (p, i) =>
        Math.abs(p[0] - (y[i]?.[0] ?? Number.NaN)) < SAME_VERTEX_EPS &&
        Math.abs(p[1] - (y[i]?.[1] ?? Number.NaN)) < SAME_VERTEX_EPS,
    )
  );
}

export const toLeaflet = (p: LatLng): [number, number] => [p.lat, p.lng];

/** A rectangle that covers the world: with the boundary as a hole it dims everything outside. */
export const WORLD_RING: [number, number][] = [
  [-85, -180],
  [-85, 180],
  [85, 180],
  [85, -180],
];

/** A multi-polygon (`[lng, lat]`, closed rings) as Leaflet positions (`[lat, lng]`, open rings). */
export function areaToLatLngs(area: MultiPolygonCoords): [number, number][][][] {
  return area.map((poly) => poly.map((ring) => ringToLatLngs(ring)));
}

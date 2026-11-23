/** Distances and bearings on the WGS84 sphere, via turf (ARCHITECTURE §1). */
import turfBearing from '@turf/bearing';
import turfDistance from '@turf/distance';

import { type LatLng, toPosition } from './types';

const M_PER_KM = 1000;
const FULL_TURN = 360;
/** Mean metres per degree of latitude. */
const M_PER_DEG_LAT = 111_320;

/** Great-circle (haversine) distance in metres. */
export function distanceM(a: LatLng, b: LatLng): number {
  return turfDistance(toPosition(a), toPosition(b), { units: 'kilometers' }) * M_PER_KM;
}

/** Initial bearing from `a` to `b`, degrees clockwise from true north, in [0, 360). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const deg = turfBearing(toPosition(a), toPosition(b));
  return ((deg % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

/** A point `eastM` east and `northM` north of `from` (flat-earth approximation; fine under a few km). */
export function offsetByMeters(from: LatLng, eastM: number, northM: number): LatLng {
  const dLat = northM / M_PER_DEG_LAT;
  const dLng = eastM / (M_PER_DEG_LAT * Math.cos((from.lat * Math.PI) / 180));
  return { lat: from.lat + dLat, lng: from.lng + dLng };
}

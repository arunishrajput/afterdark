/** `?sim=1&lat=..&lng=..` starts the simulator at a position (TESTING §4). */
import type { LatLng } from '@afterdark/shared';

export interface SimParams {
  enabled: boolean;
  start?: LatLng;
}

export function parseSimParams(search: string): SimParams {
  const q = new URLSearchParams(search);
  const enabled = q.get('sim') === '1';
  const lat = Number(q.get('lat'));
  const lng = Number(q.get('lng'));
  const valid =
    q.has('lat') &&
    q.has('lng') &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;
  return valid ? { enabled, start: { lat, lng } } : { enabled };
}

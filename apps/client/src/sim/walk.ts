/** Walking maths for the GPS simulator (TESTING §4): 1.4 m/s, 3 m/s with Shift. Pure. */
import { type LatLng, offsetByMeters } from '@afterdark/shared';

export const WALK_SPEED_MPS = 1.4;
export const RUN_SPEED_MPS = 3;

export interface Keys {
  n: boolean;
  s: boolean;
  e: boolean;
  w: boolean;
  fast: boolean;
}

export const NO_KEYS: Keys = { n: false, s: false, e: false, w: false, fast: false };

/** Moves `pos` for `dtS` seconds in the direction the keys point (north is up). */
export function stepSim(pos: LatLng, keys: Keys, dtS: number): LatLng {
  const dx = Number(keys.e) - Number(keys.w);
  const dy = Number(keys.n) - Number(keys.s);
  if (dx === 0 && dy === 0) return pos;
  const len = Math.hypot(dx, dy);
  const speed = keys.fast ? RUN_SPEED_MPS : WALK_SPEED_MPS;
  const step = speed * dtS;
  return offsetByMeters(pos, (dx / len) * step, (dy / len) * step);
}

/** WASD / arrow keys → key flags; undefined for other keys. */
export function keyFor(code: string): keyof Omit<Keys, 'fast'> | undefined {
  switch (code) {
    case 'KeyW':
    case 'ArrowUp':
      return 'n';
    case 'KeyS':
    case 'ArrowDown':
      return 's';
    case 'KeyD':
    case 'ArrowRight':
      return 'e';
    case 'KeyA':
    case 'ArrowLeft':
      return 'w';
    default:
      return undefined;
  }
}

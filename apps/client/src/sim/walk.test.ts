import { distanceM } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { keyFor, NO_KEYS, RUN_SPEED_MPS, stepSim, WALK_SPEED_MPS } from './walk';

const HOME = { lat: 28.6139, lng: 77.209 };

describe('stepSim', () => {
  it('stands still with no keys', () => {
    expect(stepSim(HOME, NO_KEYS, 1)).toBe(HOME);
  });

  it('walks at 1.4 m/s, north is +lat, east is +lng', () => {
    const n = stepSim(HOME, { ...NO_KEYS, n: true }, 10);
    expect(distanceM(HOME, n)).toBeCloseTo(WALK_SPEED_MPS * 10, 1);
    expect(n.lat).toBeGreaterThan(HOME.lat);
    const e = stepSim(HOME, { ...NO_KEYS, e: true }, 10);
    expect(e.lng).toBeGreaterThan(HOME.lng);
  });

  it('Shift runs at 3 m/s', () => {
    const p = stepSim(HOME, { ...NO_KEYS, w: true, fast: true }, 2);
    expect(distanceM(HOME, p)).toBeCloseTo(RUN_SPEED_MPS * 2, 1);
    expect(p.lng).toBeLessThan(HOME.lng);
  });

  it('does not speed up on a diagonal', () => {
    const p = stepSim(HOME, { ...NO_KEYS, n: true, e: true }, 10);
    expect(distanceM(HOME, p)).toBeCloseTo(WALK_SPEED_MPS * 10, 1);
  });

  it('opposite keys cancel out', () => {
    expect(stepSim(HOME, { ...NO_KEYS, n: true, s: true }, 5)).toBe(HOME);
  });
});

describe('keyFor', () => {
  it('maps WASD and arrows, ignores the rest', () => {
    expect(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp'].map(keyFor)).toEqual([
      'n',
      'w',
      's',
      'e',
      'n',
    ]);
    expect(keyFor('KeyQ')).toBeUndefined();
  });
});

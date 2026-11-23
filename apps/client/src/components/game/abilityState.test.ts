import { DEFAULT_CONFIG, offsetByMeters, type PlayerView } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { abilityStateOf, fakeSpotProblem } from './abilityState';

const HOME = { lat: 28.6139, lng: 77.209 };
const ring = (r: number) =>
  Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * 2 * Math.PI;
    const p = offsetByMeters(HOME, Math.sin(a) * r, Math.cos(a) * r);
    return [p.lng, p.lat] as [number, number];
  });

function view(
  over: Partial<{
    quality: 'good' | 'weak';
    oob: boolean;
    readyAt: number;
    fakes: number;
    lock: boolean;
  }> = {},
): PlayerView {
  const { quality = 'good', oob = false, readyAt = 0, fakes = 0, lock = false } = over;
  return {
    lobby: {
      map: {
        boundary: { ring: [...ring(200), ring(200)[0]!], areaM2: 1 },
        noGo: [[...ring(20).map(([lng, lat]) => [lng, lat] as [number, number]), ring(20)[0]!]],
      },
    },
    me: {
      location: { ...HOME, accuracy: 5, quality, oob: false },
      zone: { oob },
      imposter: {
        abilities: [
          { id: 'taskStop', readyAt },
          { id: 'fakeTask', readyAt },
        ],
        fakes: Array.from({ length: fakes }, (_, i) => ({
          id: `f${i}`,
          ...offsetByMeters(HOME, 100 + i * 50, 0),
          assigned: false,
        })),
      },
    },
    game: lock ? { taskLock: { until: 1 } } : {},
  } as unknown as PlayerView;
}

describe('abilityStateOf', () => {
  it('is ready when nothing blocks it', () => {
    expect(abilityStateOf(view(), 'taskStop', 1000)).toBe('ready');
    expect(abilityStateOf(view(), 'fakeTask', 1000)).toBe('ready');
  });
  it('says why it cannot: GPS, zone, cooldown, then the ability’s own rule', () => {
    expect(abilityStateOf(view({ quality: 'weak' }), 'taskStop', 1000)).toBe('gps');
    expect(abilityStateOf(view({ oob: true }), 'taskStop', 1000)).toBe('oob');
    expect(abilityStateOf(view({ readyAt: 5000 }), 'taskStop', 1000)).toBe('cooldown');
    expect(abilityStateOf(view({ lock: true }), 'taskStop', 1000)).toBe('jammed');
    expect(abilityStateOf(view({ lock: true }), 'fakeTask', 1000)).toBe('ready');
    expect(
      abilityStateOf(view({ fakes: DEFAULT_CONFIG.fakeTaskMaxActive }), 'fakeTask', 1000),
    ).toBe('full');
    expect(
      abilityStateOf(view({ fakes: DEFAULT_CONFIG.fakeTaskMaxActive }), 'taskStop', 1000),
    ).toBe('ready');
  });
});

describe('fakeSpotProblem', () => {
  it('accepts a clear spot and names the problem otherwise', () => {
    expect(fakeSpotProblem(view(), offsetByMeters(HOME, 100, 0))).toBeUndefined();
    expect(fakeSpotProblem(view(), offsetByMeters(HOME, 500, 0))).toBe('Outside the play area');
    expect(fakeSpotProblem(view(), HOME)).toBe('Inside a no-go zone');
    const withFake = view({ fakes: 1 });
    expect(fakeSpotProblem(withFake, offsetByMeters(HOME, 110, 0))).toBe(
      'Too close to your other fake',
    );
    expect(fakeSpotProblem(withFake, offsetByMeters(HOME, -100, 0))).toBeUndefined();
  });
});

import type { PlayerView } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { infectStateOf, targetOnRadar } from './infectState';

const HERE = { lat: 28.6139, lng: 77.209 };
// ~5 m and ~50 m east of HERE.
const NEAR = { lat: HERE.lat, lng: HERE.lng + 0.000051 };
const FAR = { lat: HERE.lat, lng: HERE.lng + 0.00051 };

function viewWith(over: {
  visibility?: 'nearby' | 'regions' | 'all';
  quality?: 'good' | 'weak' | 'stale';
  oob?: boolean;
  readyAt?: number;
  channel?: boolean;
}): PlayerView {
  return {
    lobby: {
      config: {
        playerVisibility: over.visibility ?? 'nearby',
        nearbyRadiusM: 40,
        infectionRadiusM: 8,
      },
    },
    me: {
      location: { ...HERE, accuracy: 5, quality: over.quality ?? 'good', oob: over.oob ?? false },
      zone: { oob: over.oob ?? false },
      imposter: {
        infect: {
          readyAt: over.readyAt ?? 0,
          ...(over.channel ? { channel: { endsAt: 1, inRange: true } } : {}),
        },
      },
    },
  } as unknown as PlayerView;
}

describe('targetOnRadar', () => {
  it('sees a crew-looking dot within 8 m', () => {
    expect(targetOnRadar(viewWith({}), [{ ...NEAR, flags: [] }])).toBe(true);
  });
  it('ignores far dots, allies, exposed, infected and stale dots', () => {
    const v = viewWith({});
    expect(targetOnRadar(v, [{ ...FAR, flags: [] }])).toBe(false);
    for (const flag of ['ally', 'exposed', 'infected', 'stale']) {
      expect(targetOnRadar(v, [{ ...NEAR, flags: [flag] }])).toBe(false);
    }
  });
  it('cannot say when the radar is empty by design (regions mode)', () => {
    expect(targetOnRadar(viewWith({ visibility: 'regions' }), [])).toBeUndefined();
  });
});

describe('infectStateOf', () => {
  it('is ready with a target, and not disabled when the radar cannot tell', () => {
    expect(infectStateOf(viewWith({}), 1000, true)).toBe('ready');
    expect(infectStateOf(viewWith({}), 1000, undefined)).toBe('ready');
  });
  it('gives the most urgent reason first', () => {
    expect(infectStateOf(viewWith({ channel: true, quality: 'stale' }), 0, true)).toBe('channel');
    expect(infectStateOf(viewWith({ quality: 'weak' }), 0, true)).toBe('gps');
    expect(infectStateOf(viewWith({ oob: true }), 0, true)).toBe('oob');
    expect(infectStateOf(viewWith({ readyAt: 5000 }), 1000, true)).toBe('cooldown');
    expect(infectStateOf(viewWith({}), 1000, false)).toBe('no-target');
  });
});

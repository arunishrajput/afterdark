import { describe, expect, it } from 'vitest';

import { cardLabel, guidance, labelOf } from './taskGeo';

describe('cardLabel', () => {
  it('reads "NE · Region A", and Centre for the centre section', () => {
    expect(cardLabel({ section: 'NE', regionName: 'Region A' })).toBe('NE · Region A');
    expect(cardLabel({ section: 'C', regionName: 'Region B' })).toBe('Centre · Region B');
  });
});

describe('labelOf', () => {
  it('names the partner to find on a co-op card', () => {
    const card = { section: 'E', regionName: 'Region A', partnerTag: 'RAPTOR-04' } as const;
    expect(labelOf({ ...card, kind: 'coop' })).toBe('Find RAPTOR-04 · E · Region A');
    expect(labelOf({ ...card, kind: 'solo' })).toBe('E · Region A');
  });
});

describe('guidance', () => {
  const here = { lat: 28.6139, lng: 77.209 };
  it('points north for a target due north, east for due east', () => {
    const north = guidance(here, { lat: here.lat + 0.001, lng: here.lng });
    expect(north.bearing).toBeCloseTo(0, 0);
    expect(north.distanceM).toBeGreaterThan(100);
    expect(north.arrowDeg).toBeCloseTo(0, 0);
    const east = guidance(here, { lat: here.lat, lng: here.lng + 0.001 });
    expect(east.bearing).toBeCloseTo(90, 0);
  });

  it('rotates the arrow against the device heading', () => {
    const g = guidance(here, { lat: here.lat, lng: here.lng + 0.001 }, 90);
    expect(g.bearing).toBeCloseTo(90, 0);
    // Facing east, so east is straight ahead (0° and 360° are the same way).
    expect(Math.min(g.arrowDeg, 360 - g.arrowDeg)).toBeCloseTo(0, 0);
    expect(guidance(here, { lat: here.lat - 0.001, lng: here.lng }, 0).arrowDeg).toBeCloseTo(
      180,
      0,
    );
  });
});

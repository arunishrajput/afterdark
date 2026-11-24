import { describe, expect, it } from 'vitest';

import { fitOptions, NO_INSETS, visibleCenter } from './insets';

/** A flat stand-in for Leaflet's projection: 1 degree = 100 px, y grows southwards. */
const flatMap = {
  project: (ll: { lat: number; lng: number }) => ({ x: ll.lng * 100, y: -ll.lat * 100 }),
  unproject: ([x, y]: [number, number]) => ({ lat: -y / 100, lng: x / 100 }),
};

describe('fitOptions', () => {
  it('pads the fit by the overlays on top of the map', () => {
    expect(fitOptions({ top: 90, bottom: 260 })).toEqual({
      paddingTopLeft: [28, 118],
      paddingBottomRight: [28, 288],
      animate: true,
    });
    expect(fitOptions(NO_INSETS, false)).toMatchObject({
      paddingTopLeft: [28, 28],
      paddingBottomRight: [28, 28],
      animate: false,
    });
  });
});

describe('visibleCenter', () => {
  const target = { lat: 10, lng: 20 };
  it('is the target itself when nothing covers the map', () => {
    expect(visibleCenter(flatMap, target, 18, NO_INSETS)).toEqual(target);
  });

  it('moves the map centre south when the bottom sheet is taller than the HUD', () => {
    // Visible band is 100..600 on a 900 px map: its middle is 150 px above the map's middle.
    const c = visibleCenter(flatMap, target, 18, { top: 100, bottom: 300 });
    expect(c.lng).toBeCloseTo(20);
    expect(c.lat).toBeCloseTo(9); // 100 px = 1 degree south
  });
});

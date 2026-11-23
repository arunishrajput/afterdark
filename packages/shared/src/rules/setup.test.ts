import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import { pointsNeeded, summarizeSetup, validateSetup } from './setup';

const regions = [
  {
    id: 'r1',
    sections: [
      { id: 'N', areaM2: 1000 },
      { id: 'S', areaM2: 100 }, // too small for tasks
    ],
  },
  { id: 'r2', sections: [{ id: 'E', areaM2: 900 }] },
];
const pt = (regionId: string, section: string, disabled = false) => ({
  regionId,
  section,
  disabled,
});

describe('summarizeSetup', () => {
  it('counts enabled points in big-enough sections, and the regions they sit in', () => {
    const s = summarizeSetup(
      {
        boundary: {},
        base: {},
        regions,
        points: [pt('r1', 'N'), pt('r1', 'N'), pt('r1', 'S'), pt('r2', 'E'), pt('r2', 'E', true)],
      },
      DEFAULT_CONFIG,
    );
    expect(s).toEqual({ boundarySet: true, baseSet: true, usablePoints: 3, regionsWithPoints: 2 });
  });

  it('reports a missing boundary and Base', () => {
    expect(summarizeSetup({}, DEFAULT_CONFIG)).toEqual({
      boundarySet: false,
      baseSet: false,
      usablePoints: 0,
      regionsWithPoints: 0,
    });
  });
});

describe('validateSetup', () => {
  const ok = { boundarySet: true, baseSet: true, usablePoints: 16, regionsWithPoints: 2 };

  it('needs 4 × players usable points', () => {
    expect(pointsNeeded(DEFAULT_CONFIG, 4)).toBe(16);
    expect(validateSetup(DEFAULT_CONFIG, 4, ok)).toEqual([]);
    expect(validateSetup(DEFAULT_CONFIG, 5, ok)).toEqual(['tooFewPoints']);
  });

  it('lists every problem at once, without point complaints before a boundary exists', () => {
    expect(
      validateSetup(DEFAULT_CONFIG, 4, {
        boundarySet: true,
        baseSet: false,
        usablePoints: 0,
        regionsWithPoints: 0,
      }),
    ).toEqual(['baseMissing', 'tooFewPoints', 'tooFewRegions']);
    expect(
      validateSetup(DEFAULT_CONFIG, 4, { ...ok, boundarySet: false, usablePoints: 0 }),
    ).toEqual(['boundaryMissing']);
  });
});

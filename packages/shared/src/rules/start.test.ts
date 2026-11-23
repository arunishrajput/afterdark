import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import type { SetupSummary } from './setup';
import { resolveImposterCount, startBlockers } from './start';

const cfg = DEFAULT_CONFIG;
const FULL_SETUP: SetupSummary = {
  boundarySet: true,
  baseSet: true,
  usablePoints: 100,
  regionsWithPoints: 3,
};

describe('resolveImposterCount', () => {
  it('auto follows imposterCountAuto (4–5 → 1, 6–9 → 2, 10–12 → 3)', () => {
    expect([4, 5, 6, 9, 10, 12].map((n) => resolveImposterCount(cfg, n))).toEqual([
      1, 1, 2, 2, 3, 3,
    ]);
  });

  it('a manual count is used as is', () => {
    expect(resolveImposterCount({ ...cfg, imposterCount: 2 }, 4)).toBe(2);
  });
});

describe('startBlockers', () => {
  it('is empty when ≥ minPlayers are all ready and the imposter count is valid', () => {
    expect(startBlockers(cfg, { playerCount: 4, readyCount: 4, setup: FULL_SETUP })).toEqual([]);
  });

  it('lists every reason the lobby cannot start yet', () => {
    expect(startBlockers(cfg, { playerCount: 3, readyCount: 1, setup: FULL_SETUP })).toEqual([
      'notEnoughPlayers',
      'notAllReady',
    ]);
  });

  it(`flags a manual imposter count that leaves < minCrewRemaining crew`, () => {
    const manual = { ...cfg, imposterCount: 2 as const };
    expect(startBlockers(manual, { playerCount: 4, readyCount: 4, setup: FULL_SETUP })).toEqual([
      'tooManyImposters',
    ]);
    expect(startBlockers(manual, { playerCount: 5, readyCount: 5, setup: FULL_SETUP })).toEqual([]);
  });

  it('requires a boundary', () => {
    const setup = { boundarySet: false, baseSet: false, usablePoints: 0, regionsWithPoints: 0 };
    expect(startBlockers(cfg, { playerCount: 4, readyCount: 4, setup })).toEqual([
      'boundaryMissing',
      'baseMissing',
    ]);
  });

  it('requires a Base, enough usable points and at least two regions with points', () => {
    const roster = { playerCount: 5, readyCount: 5 };
    expect(startBlockers(cfg, { ...roster, setup: { ...FULL_SETUP, baseSet: false } })).toEqual([
      'baseMissing',
    ]);
    // 5 players need 4 × 5 = 20 points
    expect(startBlockers(cfg, { ...roster, setup: { ...FULL_SETUP, usablePoints: 19 } })).toEqual([
      'tooFewPoints',
    ]);
    expect(startBlockers(cfg, { ...roster, setup: { ...FULL_SETUP, usablePoints: 20 } })).toEqual(
      [],
    );
    expect(
      startBlockers(cfg, { ...roster, setup: { ...FULL_SETUP, regionsWithPoints: 1 } }),
    ).toEqual(['tooFewRegions']);
  });
});

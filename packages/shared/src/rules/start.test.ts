import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import { resolveImposterCount, startBlockers } from './start';

const cfg = DEFAULT_CONFIG;

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
    expect(startBlockers(cfg, { playerCount: 4, readyCount: 4, boundarySet: true })).toEqual([]);
  });

  it('lists every reason the lobby cannot start yet', () => {
    expect(startBlockers(cfg, { playerCount: 3, readyCount: 1, boundarySet: true })).toEqual([
      'notEnoughPlayers',
      'notAllReady',
    ]);
  });

  it(`flags a manual imposter count that leaves < minCrewRemaining crew`, () => {
    const manual = { ...cfg, imposterCount: 2 as const };
    expect(startBlockers(manual, { playerCount: 4, readyCount: 4, boundarySet: true })).toEqual([
      'tooManyImposters',
    ]);
    expect(startBlockers(manual, { playerCount: 5, readyCount: 5, boundarySet: true })).toEqual([]);
  });

  it('requires a boundary', () => {
    expect(startBlockers(cfg, { playerCount: 4, readyCount: 4, boundarySet: false })).toEqual([
      'boundaryMissing',
    ]);
  });
});

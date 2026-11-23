import { DEFAULT_CONFIG } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { simulateGame } from './runGame';

const base = { players: 6, radiusM: 200, config: {}, meetings: 'random' as const };

describe('simulateGame (the balance script)', () => {
  it('plays a whole headless game to a result, with the numbers the script prints', () => {
    const g = simulateGame({ ...base, seed: 'unit1' });
    expect(['crew', 'imposters', 'draw']).toContain(g.winner);
    expect(g.reason).not.toBe('overrun');
    expect(g.reason).not.toBe('none');
    expect(g.players).toBe(6);
    expect(g.imposters).toBe(2);
    expect(g.crew).toBe(4);
    expect(g.minutes).toBeGreaterThan(1);
    expect(g.minutes).toBeLessThanOrEqual(25 + 1);
    expect(g.soloTasks + g.coopTasks).toBeGreaterThan(0);
    expect(g.teamScore).toBeGreaterThanOrEqual(0);
    expect(g.coopPoints).toBeLessThanOrEqual(g.teamScore);
    expect(g.targetScore).toBe(DEFAULT_CONFIG.targetScore);
  });

  it('is repeatable: the same seed gives the same game, another seed another', () => {
    const a = simulateGame({ ...base, seed: 'rep' });
    expect(simulateGame({ ...base, seed: 'rep' })).toEqual(a);
    const other = simulateGame({ ...base, seed: 'rep2' });
    expect(other).not.toEqual({ ...a, seed: 'rep2' });
  });

  it('takes config overrides: a target of 10 is reached at once and meetings can be switched off', () => {
    const g = simulateGame({ ...base, seed: 'cfg', config: { targetScore: 10 }, meetings: 'off' });
    expect(g.targetScore).toBe(10);
    expect(g.meetings).toBe(0);
    expect(g.winner).toBe('crew');
    expect(g.reason).toBe('score');
  });
});

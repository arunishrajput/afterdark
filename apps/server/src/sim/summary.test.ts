import { describe, expect, it } from 'vitest';

import type { GameStats } from './runGame';
import { median, parseSimArgs, summarise } from './summary';

const game = (over: Partial<GameStats>): GameStats => ({
  seed: 's',
  players: 8,
  imposters: 2,
  winner: 'crew',
  reason: 'score',
  minutes: 10,
  teamScore: 100,
  targetScore: 100,
  soloTasks: 12,
  coopTasks: 2,
  coopPoints: 24,
  crew: 6,
  infected: 1,
  exposed: 2,
  infectionsCompleted: 2,
  meetings: 1,
  impostersEjected: 0,
  crewEjected: 0,
  taskStops: 1,
  ...over,
});

describe('median', () => {
  it('takes the middle, or the mean of the two middle values', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('summarise', () => {
  const games = [
    game({ winner: 'crew', reason: 'score', minutes: 12 }),
    game({
      winner: 'imposters',
      reason: 'infection',
      minutes: 8,
      soloTasks: 6,
      coopTasks: 0,
      coopPoints: 0,
    }),
    game({ winner: 'imposters', reason: 'time', minutes: 25 }),
    game({ winner: 'draw', reason: 'time', minutes: 25 }),
  ];
  const s = summarise(games);

  it('counts wins and the way games ended', () => {
    expect(s.games).toBe(4);
    expect(s.imposterWinPercent).toBe(50);
    expect(s.crewWinPercent).toBe(25);
    expect(s.drawPercent).toBe(25);
    expect(s.reasons).toEqual({ score: 1, infection: 1, time: 2 });
    expect(s.earlyEndPercent).toBe(50);
    expect(s.timeUpPercent).toBe(50);
  });

  it('reports the median length, tasks per crew member, infections, meetings and co-op share', () => {
    expect(s.medianMinutes).toBe(18.5);
    // (14 + 6 + 14 + 14) tasks over 4 games of 6 crew.
    expect(s.tasksPerCrew).toBeCloseTo(48 / 24);
    expect(s.infectionsPerGame).toBe(2);
    expect(s.meetingsPerGame).toBe(1);
    expect(s.coopTasksPerGame).toBe(1.5);
    // Co-op points over all team points.
    expect(s.coopShareOfScore).toBeCloseTo(72 / 400);
  });

  it('copes with no games', () => {
    expect(summarise([]).games).toBe(0);
    expect(summarise([]).imposterWinPercent).toBe(0);
  });
});

describe('parseSimArgs', () => {
  it('has defaults and reads the flags', () => {
    expect(parseSimArgs([])).toMatchObject({
      games: 50,
      players: 8,
      meetings: 'random',
      json: false,
    });
    const a = parseSimArgs([
      '--games',
      '10',
      '--players',
      '6',
      '--radius',
      '150',
      '--meetings',
      'off',
      '--json',
    ]);
    expect(a).toMatchObject({ games: 10, players: 6, radiusM: 150, meetings: 'off', json: true });
  });

  it('survives a leading -- from pnpm and rejects nonsense', () => {
    expect(parseSimArgs(['--', '--games', '3']).games).toBe(3);
    expect(() => parseSimArgs(['--games', '0'])).toThrow(/games/);
    expect(() => parseSimArgs(['--players', '3'])).toThrow(/players/);
    expect(() => parseSimArgs(['--meetings', 'sometimes'])).toThrow(/meetings/);
  });
});

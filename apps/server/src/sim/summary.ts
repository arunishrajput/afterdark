/** Turns finished simulated games into the table the balance script prints, and reads its options. */
import { parseArgs } from 'node:util';

import type { GameStats } from './runGame';

const PERCENT = 100;
const DEFAULT_GAMES = 50;
const DEFAULT_PLAYERS = 8;
const DEFAULT_RADIUS_M = 200;
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 12;

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

const mean = (values: readonly number[]) =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

export interface Summary {
  games: number;
  imposterWinPercent: number;
  crewWinPercent: number;
  drawPercent: number;
  /** How games ended, by reason. */
  reasons: Record<string, number>;
  /** Ended before the clock ran out (score, infection, ejection). */
  earlyEndPercent: number;
  timeUpPercent: number;
  medianMinutes: number;
  tasksPerCrew: number;
  infectionsPerGame: number;
  meetingsPerGame: number;
  coopTasksPerGame: number;
  /** Share of all team points that came from co-op tasks. */
  coopShareOfScore: number;
  taskStopsPerGame: number;
}

export function summarise(games: readonly GameStats[]): Summary {
  const n = games.length;
  const pct = (count: number) => (n === 0 ? 0 : (count / n) * PERCENT);
  const reasons: Record<string, number> = {};
  for (const g of games) reasons[g.reason] = (reasons[g.reason] ?? 0) + 1;
  const timeUp = games.filter((g) => g.reason === 'time').length;
  const totalCrew = sum(games.map((g) => g.crew));
  const totalScore = sum(games.map((g) => g.teamScore));
  return {
    games: n,
    imposterWinPercent: pct(games.filter((g) => g.winner === 'imposters').length),
    crewWinPercent: pct(games.filter((g) => g.winner === 'crew').length),
    drawPercent: pct(games.filter((g) => g.winner === 'draw').length),
    reasons,
    earlyEndPercent: pct(n - timeUp),
    timeUpPercent: pct(timeUp),
    medianMinutes: median(games.map((g) => g.minutes)),
    tasksPerCrew: totalCrew === 0 ? 0 : sum(games.map((g) => g.soloTasks + g.coopTasks)) / totalCrew,
    infectionsPerGame: mean(games.map((g) => g.infectionsCompleted)),
    meetingsPerGame: mean(games.map((g) => g.meetings)),
    coopTasksPerGame: mean(games.map((g) => g.coopTasks)),
    coopShareOfScore: totalScore === 0 ? 0 : sum(games.map((g) => g.coopPoints)) / totalScore,
    taskStopsPerGame: mean(games.map((g) => g.taskStops)),
  };
}

export interface SimArgs {
  games: number;
  players: number;
  radiusM: number;
  /** Path of a JSON file of config overrides. */
  config?: string;
  meetings: 'off' | 'random';
  seed: string;
  json: boolean;
  /** Worker processes (1 = in this process). */
  jobs: number;
}

export const USAGE = `Usage: pnpm bots:simulate [--games ${DEFAULT_GAMES}] [--players ${DEFAULT_PLAYERS}] [--config overrides.json] [--radius ${DEFAULT_RADIUS_M}] [--meetings off|random] [--seed a] [--jobs 1] [--json]

  Plays headless games with the real engine and bots at accelerated game time and prints the win rates,
  the median game length, how games ended, tasks per crew member, infections and meetings per game.
  --config  a JSON object of config overrides, e.g. {"infectionCooldownS": 75, "targetScore": 110}`;

function positiveInt(name: string, value: string, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`--${name} must be a whole number from ${min} to ${max}`);
  }
  return n;
}

export function parseSimArgs(argv: readonly string[]): SimArgs {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const { values } = parseArgs({
    args: [...args],
    options: {
      games: { type: 'string', default: String(DEFAULT_GAMES) },
      players: { type: 'string', default: String(DEFAULT_PLAYERS) },
      radius: { type: 'string', default: String(DEFAULT_RADIUS_M) },
      config: { type: 'string' },
      meetings: { type: 'string', default: 'random' },
      seed: { type: 'string', default: 'a' },
      jobs: { type: 'string', default: '1' },
      json: { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (values.meetings !== 'off' && values.meetings !== 'random') {
    throw new Error('--meetings must be off or random');
  }
  return {
    games: positiveInt('games', values.games),
    players: positiveInt('players', values.players, MIN_PLAYERS, MAX_PLAYERS),
    radiusM: positiveInt('radius', values.radius, 50, 1000),
    ...(values.config === undefined ? {} : { config: values.config }),
    meetings: values.meetings,
    seed: values.seed,
    jobs: positiveInt('jobs', values.jobs, 1, 32),
    json: values.json,
  };
}

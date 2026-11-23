/**
 * `pnpm bots:simulate`: the balance script (Phase 11, TESTING §5). Plays many headless games and prints
 * the numbers that tuning needs. `--jobs N` splits the games over N worker processes (same results).
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { gameConfigSchema } from '@afterdark/shared';

import { type GameStats, simulateGame } from './runGame';
import { parseSimArgs, type SimArgs, summarise, USAGE } from './summary';

const WORKER_ENV = 'AFTERDARK_SIM_WORKER';

function loadOverrides(path: string | undefined) {
  if (!path) return {};
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  // Unknown keys and out-of-range values are a typo, not a tuning choice.
  return gameConfigSchema.partial().parse(raw);
}

function playRange(args: SimArgs, from: number, count: number): GameStats[] {
  const config = loadOverrides(args.config);
  const out: GameStats[] = [];
  for (let i = from; i < from + count; i++) {
    out.push(
      simulateGame({
        seed: `${args.seed}${i}`,
        players: args.players,
        radiusM: args.radiusM,
        config,
        meetings: args.meetings,
      }),
    );
  }
  return out;
}

function runWorker(args: SimArgs, from: number, count: number): Promise<GameStats[]> {
  return new Promise((resolve, reject) => {
    const entry = fileURLToPath(import.meta.url);
    const child = spawn(process.execPath, ['--import', 'tsx', entry, ...process.argv.slice(2)], {
      env: { ...process.env, [WORKER_ENV]: `${from},${count}` },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`a worker exited with ${code}`));
      else resolve(JSON.parse(out) as GameStats[]);
    });
    void args;
  });
}

const pad = (label: string) => label.padEnd(40);

function print(args: SimArgs, games: GameStats[]): void {
  const s = summarise(games);
  const f1 = (n: number) => n.toFixed(1);
  const lines = [
    `${s.games} games, ${args.players} players, ${args.radiusM} m radius, meetings ${args.meetings}${args.config ? `, overrides ${args.config}` : ''}`,
    '',
    `${pad('Imposter wins')}${f1(s.imposterWinPercent)} %`,
    `${pad('Crew wins')}${f1(s.crewWinPercent)} %`,
    `${pad('Draws')}${f1(s.drawPercent)} %`,
    `${pad('Median game length')}${f1(s.medianMinutes)} min`,
    `${pad('Ended early (score/infection/ejection)')}${f1(s.earlyEndPercent)} %`,
    `${pad('Ended by time-up')}${f1(s.timeUpPercent)} %`,
    `${pad('How games ended')}${Object.entries(s.reasons)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`,
    `${pad('Tasks per crew member')}${f1(s.tasksPerCrew)}`,
    `${pad('Co-op tasks per game')}${f1(s.coopTasksPerGame)} (${f1(s.coopShareOfScore * 100)} % of team points)`,
    `${pad('Infections per game')}${f1(s.infectionsPerGame)}`,
    `${pad('Meetings per game')}${f1(s.meetingsPerGame)}`,
    `${pad('Task Stops per game')}${f1(s.taskStopsPerGame)}`,
  ];
  console.log(lines.join('\n'));
}

async function main(): Promise<void> {
  const args = parseSimArgs(process.argv.slice(2));
  const worker = process.env[WORKER_ENV];
  if (worker) {
    const [from, count] = worker.split(',').map(Number) as [number, number];
    process.stdout.write(JSON.stringify(playRange(args, from, count)));
    return;
  }
  let games: GameStats[];
  if (args.jobs <= 1) games = playRange(args, 0, args.games);
  else {
    const per = Math.ceil(args.games / args.jobs);
    const parts: Promise<GameStats[]>[] = [];
    for (let from = 0; from < args.games; from += per) {
      parts.push(runWorker(args, from, Math.min(per, args.games - from)));
    }
    games = (await Promise.all(parts)).flat();
  }
  if (args.json) console.log(JSON.stringify({ summary: summarise(games), games }));
  else print(args, games);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  console.error(USAGE);
  process.exitCode = 1;
});

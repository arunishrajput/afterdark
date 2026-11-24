/**
 * `pnpm bots:load -- --lobbies 20 --players 8`: the Phase 14 load test (PRD NFR-1, NFR-3;
 * ARCHITECTURE §11). Every lobby is all bots over real sockets: a hosting bot creates it,
 * switches on test mode (visibility Everyone, all abilities), draws a 200 m circle and plays;
 * the others join. Imposters chase and sabotage and each bot calls one meeting, so every system
 * runs. It measures, from the bots' side, the time from sending a fix to seeing it in their own
 * view; with `--server-log` it reads the server's room tick and command times, and with
 * `--server-pid` it samples the server's memory.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { offsetByMeters } from '@afterdark/shared';

import { Bot } from './bot';
import { LOAD_USAGE, type LoadArgs, parseLoadArgs } from './loadArgs';
import { statsOf, summarizeRoomLog } from './loadStats';

const HOME = { lat: 28.6139, lng: 77.209 };
const AREA_RADIUS_M = 200;
/** Lobbies sit side by side, so a map of all of them would not overlap (nothing depends on it). */
const LOBBY_SPACING_M = 600;
const PROGRESS_EVERY_MS = 10_000;
const MEMORY_EVERY_MS = 5_000;
const FORCE_START_AFTER_S = 30;
const KB_PER_MB = 1024;
const MS_PER_S = 1000;

const run = promisify(execFile);
const out = (line: string) => process.stdout.write(`${line}\n`);
const round = (n: number) => Math.round(n * 100) / 100;

async function rssMb(pid: number): Promise<number | undefined> {
  try {
    const { stdout } = await run('ps', ['-o', 'rss=', '-p', String(pid)]);
    const kb = Number(stdout.trim());
    return Number.isFinite(kb) && kb > 0 ? kb / KB_PER_MB : undefined;
  } catch {
    return undefined;
  }
}

async function fillLobby(
  args: LoadArgs,
  index: number,
  onLatency: (ms: number) => void,
  problems: string[],
): Promise<Bot[]> {
  // Only failures are printed: 160 bots announcing every phase would drown the numbers.
  const log = (line: string) => {
    if (line.includes('could not')) problems.push(line);
  };
  const common = {
    url: args.url,
    seed: index + 1,
    speed: args.speed,
    imposterBehaviour: 'sabotage' as const,
    meetings: 'random' as const,
    log,
    onLatency,
  };
  const host = new Bot({
    ...common,
    code: '',
    name: 'host',
    forceStartAfterS: FORCE_START_AFTER_S,
  });
  const code = await host.host({
    config: { playerVisibility: 'all', imposterAbilityMode: 'all' },
    center: offsetByMeters(HOME, index * LOBBY_SPACING_M, 0),
    radiusM: AREA_RADIUS_M,
  });
  if (!code) return [];
  const guests = Array.from(
    { length: args.players - 1 },
    (_, i) => new Bot({ ...common, code, name: `bot-${i + 1}` }),
  );
  const joined = await Promise.all(guests.map((b) => b.start()));
  return [host, ...guests.filter((_, i) => joined[i])];
}

async function main(): Promise<void> {
  let args: LoadArgs;
  try {
    args = parseLoadArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n\n${LOAD_USAGE}\n`);
    process.exitCode = 1;
    return;
  }
  const latencies: number[] = [];
  const memory: number[] = [];
  const problems: string[] = [];
  const onLatency = (ms: number) => latencies.push(ms);

  out(`Load test: ${args.lobbies} lobbies × ${args.players} bots against ${args.url}`);
  const setupStarted = Date.now();
  const lobbies: Bot[][] = [];
  for (let i = 0; i < args.lobbies; i++) {
    lobbies.push(await fillLobby(args, i, onLatency, problems));
  }
  const bots = lobbies.flat();
  out(
    `${bots.length} bots in ${lobbies.filter((l) => l.length > 0).length} lobbies after ${round((Date.now() - setupStarted) / MS_PER_S)} s`,
  );

  const sampleMemory = async () => {
    if (args.serverPid === undefined) return;
    const mb = await rssMb(args.serverPid);
    if (mb !== undefined) memory.push(mb);
  };
  await sampleMemory();
  const memTimer = setInterval(() => void sampleMemory(), MEMORY_EVERY_MS);
  const started = Date.now();
  const progress = setInterval(() => {
    const phases = new Map<string, number>();
    for (const lobby of lobbies) {
      const phase = lobby[0]?.phase ?? 'none';
      phases.set(phase, (phases.get(phase) ?? 0) + 1);
    }
    const p = statsOf(latencies);
    out(
      `t=${Math.round((Date.now() - started) / MS_PER_S)} s · lobbies ${[...phases].map(([k, v]) => `${k} ${v}`).join(', ')} · fixes seen ${p.count}, p95 ${round(p.p95)} ms` +
        (memory.length ? ` · server RSS ${round(memory.at(-1) ?? 0)} MB` : ''),
    );
  }, PROGRESS_EVERY_MS);

  await new Promise((resolve) => setTimeout(resolve, args.durationS * MS_PER_S));
  clearInterval(progress);
  clearInterval(memTimer);
  const reached = new Map<string, number>();
  for (const lobby of lobbies) {
    const phase = lobby[0]?.phase ?? 'none';
    reached.set(phase, (reached.get(phase) ?? 0) + 1);
  }
  for (const b of bots) b.stop();

  const lat = statsOf(latencies);
  out('');
  out('── Results ──');
  out(`Lobbies at the end: ${[...reached].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  out(
    `Fix → own view latency (ms): n=${lat.count} p50=${round(lat.p50)} p95=${round(lat.p95)} p99=${round(lat.p99)} max=${round(lat.max)}`,
  );
  if (memory.length > 0) {
    const mem = statsOf(memory);
    out(
      `Server RSS (MB): start=${round(memory[0] ?? 0)} p50=${round(mem.p50)} max=${round(mem.max)}`,
    );
  }
  if (args.serverLog) {
    const log = summarizeRoomLog(await readFile(args.serverLog, 'utf8'));
    const line = (name: string, s: typeof log.tick) =>
      `${name} (ms): n=${s.count} p50=${s.p50} p95=${s.p95} p99=${s.p99} max=${s.max}`;
    out(`Rooms in the server log: ${log.rooms}; slow operations (≥ 50 ms): ${log.slow}`);
    out(line('Room tick', log.tick));
    out(line('Room command', log.command));
  }
  out(`Problems: ${problems.length === 0 ? 'none' : ''}`);
  for (const p of problems.slice(0, 20)) out(`  ${p}`);
  process.exit(0);
}

void main();

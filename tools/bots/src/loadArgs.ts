/** Command-line options for `pnpm bots:load` (Phase 14 load test, TESTING.md §5). */
import { parseArgs } from 'node:util';

export interface LoadArgs {
  url: string;
  lobbies: number;
  players: number;
  /** Seconds of measurement after every lobby is full. */
  durationS: number;
  speed: number;
  /** The server's pino log (LOG_LEVEL=debug) to read room tick and command times from. */
  serverLog: string | undefined;
  /** The server's process id, to sample its memory (local runs only). */
  serverPid: number | undefined;
}

const DEFAULTS = {
  url: 'http://localhost:3000',
  lobbies: 20,
  players: 8,
  durationS: 180,
  speed: 4,
};
const MAX_LOBBIES = 50;
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 12;
const MIN_DURATION_S = 10;
const MAX_DURATION_S = 1800;
const MAX_SPEED_FACTOR = 8;

export const LOAD_USAGE = `Usage: pnpm bots:load -- [--lobbies ${DEFAULTS.lobbies}] [--players ${DEFAULTS.players}] [--duration ${DEFAULTS.durationS}] [--url ${DEFAULTS.url}] [--speed ${DEFAULTS.speed}] [--server-log server.log] [--server-pid 1234]

  --lobbies     lobbies to create (1-${MAX_LOBBIES}); each gets a hosting bot that sets up test mode and an area
  --players     players per lobby, host included (${MIN_PLAYERS}-${MAX_PLAYERS})
  --duration    seconds to measure once every lobby is full (${MIN_DURATION_S}-${MAX_DURATION_S})
  --url         server URL
  --speed       walking-speed multiplier (at most ${MAX_SPEED_FACTOR}; the server rejects faster jumps)
  --server-log  the server's JSON log at LOG_LEVEL=debug: room tick and command times are read from it at the end
  --server-pid  the local server's process id: its memory (RSS) is sampled every 5 s`;

function intIn(raw: string | undefined, name: string, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`--${name} must be a whole number from ${min} to ${max}`);
  }
  return n;
}

export function parseLoadArgs(argv: readonly string[]): LoadArgs {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const { values } = parseArgs({
    args: [...args],
    options: {
      url: { type: 'string', default: DEFAULTS.url },
      lobbies: { type: 'string', default: String(DEFAULTS.lobbies) },
      players: { type: 'string', default: String(DEFAULTS.players) },
      duration: { type: 'string', default: String(DEFAULTS.durationS) },
      speed: { type: 'string', default: String(DEFAULTS.speed) },
      'server-log': { type: 'string' },
      'server-pid': { type: 'string' },
    },
    strict: true,
  });
  const speed = Number(values.speed);
  if (!Number.isFinite(speed) || speed <= 0 || speed > MAX_SPEED_FACTOR) {
    throw new Error(`--speed must be above 0 and at most ${MAX_SPEED_FACTOR}`);
  }
  const pid = values['server-pid'];
  return {
    url: values.url ?? DEFAULTS.url,
    lobbies: intIn(values.lobbies, 'lobbies', 1, MAX_LOBBIES),
    players: intIn(values.players, 'players', MIN_PLAYERS, MAX_PLAYERS),
    durationS: intIn(values.duration, 'duration', MIN_DURATION_S, MAX_DURATION_S),
    speed,
    serverLog: values['server-log'],
    serverPid: pid === undefined ? undefined : intIn(pid, 'server-pid', 1, Number.MAX_SAFE_INTEGER),
  };
}

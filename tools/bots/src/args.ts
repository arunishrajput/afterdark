/** Command-line options for `pnpm bots` (TESTING.md §5). */
import { parseArgs } from 'node:util';

export interface BotArgs {
  url: string;
  code: string;
  count: number;
  /** Walking-speed multiplier (the server still rejects jumps above `maxSpeedMps`). */
  speed: number;
  /** Seed of the bots' walks, so a run can be repeated. */
  seed: number;
}

const DEFAULT_URL = 'http://localhost:3000';
const DEFAULT_COUNT = 7;
const MAX_COUNT = 11;
const MAX_SPEED_FACTOR = 8;
const DEFAULT_SEED = 1;

export const USAGE = `Usage: pnpm bots -- --code ABC123 [--url ${DEFAULT_URL}] [--count ${DEFAULT_COUNT}] [--speed 1] [--seed 1]

  --code   lobby code to join (required)
  --url    server URL (default ${DEFAULT_URL})
  --count  how many bots (1-${MAX_COUNT}, default ${DEFAULT_COUNT})
  --speed  walking-speed multiplier (default 1 = 1.4 m/s)
  --seed   random seed for the walks (default ${DEFAULT_SEED})`;

export function parseBotArgs(argv: readonly string[]): BotArgs {
  // `pnpm bots -- --code X` can leave a literal `--` in front of the options.
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const { values } = parseArgs({
    args: [...args],
    options: {
      url: { type: 'string', default: DEFAULT_URL },
      code: { type: 'string' },
      count: { type: 'string', default: String(DEFAULT_COUNT) },
      speed: { type: 'string', default: '1' },
      seed: { type: 'string', default: String(DEFAULT_SEED) },
    },
    strict: true,
  });
  const code = values.code?.trim().toUpperCase();
  if (!code) throw new Error('--code is required');
  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    throw new Error(`--count must be a whole number from 1 to ${MAX_COUNT}`);
  }
  const speed = Number(values.speed);
  if (!Number.isFinite(speed) || speed <= 0 || speed > MAX_SPEED_FACTOR) {
    throw new Error(`--speed must be above 0 and at most ${MAX_SPEED_FACTOR}`);
  }
  const seed = Number(values.seed);
  if (!Number.isInteger(seed) || seed < 0) throw new Error('--seed must be a whole number');
  return { url: values.url ?? DEFAULT_URL, code, count, speed, seed };
}

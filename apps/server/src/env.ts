/** Process environment, validated once at startup. */
import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const DEFAULT_PORT = 3000;

const envSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65_535).default(DEFAULT_PORT),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  /** Lets hosts enable per-lobby test mode (ADR-024). Defaults to off in production. */
  ALLOW_TEST_MODE: z.stringbool().optional(),
  /**
   * Test-only: every room gets this secret salt, so spawns and roles are reproducible
   * (e2e picks a salt that gives the human the role it wants to screenshot). Ignored
   * unless test mode is allowed, so a production server can't be pinned to a known seed.
   */
  TEST_ROOM_SALT: z.string().min(1).optional(),
});

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Env {
  PORT: number;
  NODE_ENV: 'development' | 'test' | 'production';
  LOG_LEVEL: LogLevel;
  ALLOW_TEST_MODE: boolean;
  /** Only set when test mode is allowed. */
  TEST_ROOM_SALT?: string;
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = envSchema.parse(source);
  const allowTestMode = parsed.ALLOW_TEST_MODE ?? parsed.NODE_ENV !== 'production';
  return {
    PORT: parsed.PORT,
    NODE_ENV: parsed.NODE_ENV,
    LOG_LEVEL: parsed.LOG_LEVEL,
    ALLOW_TEST_MODE: allowTestMode,
    ...(allowTestMode && parsed.TEST_ROOM_SALT ? { TEST_ROOM_SALT: parsed.TEST_ROOM_SALT } : {}),
  };
}

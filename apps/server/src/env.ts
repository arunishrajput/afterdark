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
});

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Env {
  PORT: number;
  NODE_ENV: 'development' | 'test' | 'production';
  LOG_LEVEL: LogLevel;
  ALLOW_TEST_MODE: boolean;
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = envSchema.parse(source);
  return {
    PORT: parsed.PORT,
    NODE_ENV: parsed.NODE_ENV,
    LOG_LEVEL: parsed.LOG_LEVEL,
    ALLOW_TEST_MODE: parsed.ALLOW_TEST_MODE ?? parsed.NODE_ENV !== 'production',
  };
}

/**
 * pino logger. Invariant 8: never log coordinates, tokens or secret roles, so
 * those paths are redacted as a safety net (code still must not pass them).
 */
import { type Logger, pino } from 'pino';

import type { LogLevel } from './env';

export type { Logger };

const REDACT_PATHS = [
  'token',
  '*.token',
  'lat',
  'lng',
  '*.lat',
  '*.lng',
  'role',
  '*.role',
  'req.headers.cookie',
  'req.headers.authorization',
];

export function createLogger(opts: { level: LogLevel; pretty: boolean }): Logger {
  return pino({
    level: opts.level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    ...(opts.pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss' },
          },
        }
      : {}),
  });
}

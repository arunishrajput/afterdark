/**
 * Wraps a client → server handler: Invariant 2 (zod validation before any
 * logic), a guaranteed ack shape, and no crash on a missing ack callback.
 */
import type { Ack, ErrorCode } from '@afterdark/shared';
import type { z } from 'zod';

import type { Logger } from '../logger';

export class HandlerError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function validated<S extends z.ZodType, T>(
  event: string,
  schema: S,
  logger: Logger,
  fn: (payload: z.infer<S>) => T,
): (payload: unknown, ack?: unknown) => void {
  return (payload, ack) => {
    const reply = (res: Ack<T>) => {
      if (typeof ack === 'function') (ack as (r: Ack<T>) => void)(res);
    };
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      logger.warn({ event, issues: parsed.error.issues.length }, 'invalid payload');
      reply({ ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Invalid payload' } });
      return;
    }
    try {
      reply({ ok: true, data: fn(parsed.data) });
    } catch (err) {
      if (err instanceof HandlerError) {
        reply({ ok: false, error: { code: err.code, message: err.message } });
        return;
      }
      logger.error({ event, err }, 'handler failed');
      reply({ ok: false, error: { code: 'INTERNAL', message: 'Internal error' } });
    }
  };
}

/** zod schemas for every client → server payload (mirrors docs/PROTOCOL.md). */
import { z } from 'zod';

export const ERROR_CODES = [
  'INVALID_PAYLOAD',
  'NOT_FOUND',
  'LOBBY_FULL',
  'GAME_IN_PROGRESS',
  'NAME_TAKEN',
  'NOT_HOST',
  'NOT_ALLOWED',
  'WRONG_PHASE',
  'COOLDOWN',
  'OUT_OF_RANGE',
  'WEAK_GPS',
  'STALE',
  'OUT_OF_BOUNDS',
  'TASKS_LOCKED',
  'MEETING_ACTIVE',
  'PAUSED',
  'RATE_LIMITED',
  'KICKED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const timePingSchema = z.strictObject({
  clientTs: z.number().finite(),
});
export type TimePingPayload = z.infer<typeof timePingSchema>;

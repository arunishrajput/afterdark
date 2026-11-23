/** zod schemas for every client → server payload (mirrors docs/PROTOCOL.md). */
import { z } from 'zod';

import { DEFAULT_CONFIG } from '../config/defaults';
import { editableConfigPatchSchema } from '../config/schema';
import { ID_ALPHABET } from '../ids';

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

// ── Shared field schemas ────────────────────────────────────────────────────

const escapeForClass = (chars: string) => chars.replace(/[\\\]^-]/g, '\\$&');

/** Letters (+ combining marks, needed by e.g. Devanagari), digits, space, `_`, `.`, `-` (ADR-034). */
const USERNAME_CHARSET = /^[\p{L}\p{M}\p{N} _.-]+$/u;
/** Cheap pre-check so huge strings are rejected before normalisation. */
const USERNAME_RAW_MAX = 64;

/** NFC-normalised, trimmed, runs of spaces collapsed; 2–16 code points. */
export const usernameSchema = z
  .string()
  .max(USERNAME_RAW_MAX)
  .transform((s) => s.normalize('NFC').trim().replace(/ {2,}/g, ' '))
  .refine((s) => USERNAME_CHARSET.test(s), { message: 'Letters, digits, space, _ . - only' })
  .refine(
    (s) => {
      const len = [...s].length;
      return len >= DEFAULT_CONFIG.usernameMinLen && len <= DEFAULT_CONFIG.usernameMaxLen;
    },
    {
      message: `${DEFAULT_CONFIG.usernameMinLen}–${DEFAULT_CONFIG.usernameMaxLen} characters`,
    },
  );

const LOBBY_CODE_PATTERN = new RegExp(
  `^[${escapeForClass(DEFAULT_CONFIG.lobbyCodeAlphabet)}]{${DEFAULT_CONFIG.lobbyCodeLength}}$`,
);

/** Trimmed and upper-cased, then checked against the code alphabet and length. */
export const lobbyCodeSchema = z.string().trim().toUpperCase().regex(LOBBY_CODE_PATTERN);

const ID_PATTERN = new RegExp(`^[${escapeForClass(ID_ALPHABET)}]+$`);
const TOKEN_MIN = 16;
const ID_MIN = 12;
const ID_MAX = 64;

export const tokenSchema = z.string().min(TOKEN_MIN).max(ID_MAX).regex(ID_PATTERN);
export const playerIdSchema = z.string().min(ID_MIN).max(ID_MAX).regex(ID_PATTERN);

// ── Phase 1: sessions and lobby ─────────────────────────────────────────────

export const sessionResumeSchema = z.strictObject({ token: tokenSchema });
export type SessionResumePayload = z.infer<typeof sessionResumeSchema>;

export const lobbyCreateSchema = z.strictObject({
  username: usernameSchema,
  acceptedSafety: z.literal(true),
});
export type LobbyCreatePayload = z.input<typeof lobbyCreateSchema>;

export const lobbyJoinSchema = z.strictObject({
  code: lobbyCodeSchema,
  username: usernameSchema,
  acceptedSafety: z.literal(true),
});
export type LobbyJoinPayload = z.input<typeof lobbyJoinSchema>;

export const lobbyLeaveSchema = z.strictObject({});
export type LobbyLeavePayload = z.infer<typeof lobbyLeaveSchema>;

export const lobbySetReadySchema = z.strictObject({ ready: z.boolean() });
export type LobbySetReadyPayload = z.infer<typeof lobbySetReadySchema>;

export const lobbyUpdateConfigSchema = z.strictObject({ patch: editableConfigPatchSchema });
export type LobbyUpdateConfigPayload = z.infer<typeof lobbyUpdateConfigSchema>;

export const lobbyKickSchema = z.strictObject({ playerId: playerIdSchema });
export type LobbyKickPayload = z.infer<typeof lobbyKickSchema>;

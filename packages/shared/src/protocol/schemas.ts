/** zod schemas for every client → server payload (mirrors docs/PROTOCOL.md). */
import { z } from 'zod';

import { BOT_MEETING_MODES } from '../bots';
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

// ── Phase 2: location and boundary ──────────────────────────────────────────

/** Payload sanity limits (protocol, not game rules; game limits live in CONFIG). */
const MAX_REPORTED_ACCURACY_M = 100_000;
const MAX_BOUNDARY_VERTICES = 500;
const MAX_CIRCLE_RADIUS_M = 10_000;
const MIN_BOUNDARY_VERTICES = 3;
const MAX_HEADING_DEG = 360;

const latSchema = z.number().min(-90).max(90);
const lngSchema = z.number().min(-180).max(180);
const latLngSchema = z.strictObject({ lat: latSchema, lng: lngSchema });

/** A GPS fix. `ts` is server-aligned epoch ms (the client applies its clock offset). */
export const locUpdateSchema = z.strictObject({
  lat: latSchema,
  lng: lngSchema,
  accuracy: z.number().min(0).max(MAX_REPORTED_ACCURACY_M),
  ts: z.number().finite(),
  heading: z.number().min(0).max(MAX_HEADING_DEG).optional(),
  speed: z.number().min(0).optional(),
});
export type LocUpdatePayload = z.infer<typeof locUpdateSchema>;

export const boundaryInputSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('polygon'),
    coords: z
      .array(z.tuple([lngSchema, latSchema]))
      .min(MIN_BOUNDARY_VERTICES)
      .max(MAX_BOUNDARY_VERTICES),
  }),
  z.strictObject({
    type: z.literal('circle'),
    center: latLngSchema,
    radiusM: z.number().positive().max(MAX_CIRCLE_RADIUS_M),
  }),
]);

export const lobbySetBoundarySchema = z.strictObject({ boundary: boundaryInputSchema });
export type LobbySetBoundaryPayload = z.infer<typeof lobbySetBoundarySchema>;

export const devTeleportSchema = latLngSchema;
export type DevTeleportPayload = z.infer<typeof devTeleportSchema>;

// ── Phase 3: regions, task points, no-go zones, Base ────────────────────────

/** Protocol sanity limits (game limits live in CONFIG). */
const MAX_NOGO_ZONES = 20;
const MAX_NOGO_VERTICES = 200;
const MIN_NOGO_VERTICES = 3;
const MAX_POINTS_ADDED_PER_CALL = 20;
const MAX_POINTS_REMOVED_PER_CALL = 200;
const MAX_SEED = 0xffff_ffff;
const MIN_REGIONS_SETTING = 2;
const MAX_REGIONS_SETTING = 6;

/** Region and task-point ids are short server-made tokens such as `r2` and `p17`. */
const SETUP_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const setupIdSchema = z.string().regex(SETUP_ID_PATTERN);

/** Letters, digits, space and a few marks (NFC, trimmed, spaces collapsed). */
const REGION_NAME_CHARSET = /^[\p{L}\p{M}\p{N} _.'-]+$/u;
const REGION_NAME_RAW_MAX = 64;

export const regionNameSchema = z
  .string()
  .max(REGION_NAME_RAW_MAX)
  .transform((s) => s.normalize('NFC').trim().replace(/ {2,}/g, ' '))
  .refine((s) => REGION_NAME_CHARSET.test(s), { message: "Letters, digits, space, _ . ' - only" })
  .refine((s) => [...s].length <= DEFAULT_CONFIG.regionNameMaxLen, {
    message: `At most ${DEFAULT_CONFIG.regionNameMaxLen} characters`,
  });

export const lobbyRegenerateRegionsSchema = z.strictObject({
  regionCount: z
    .union([z.literal('auto'), z.number().int().min(MIN_REGIONS_SETTING).max(MAX_REGIONS_SETTING)])
    .optional(),
  seed: z.number().int().min(0).max(MAX_SEED).optional(),
});
export type LobbyRegenerateRegionsPayload = z.infer<typeof lobbyRegenerateRegionsSchema>;

export const lobbyRenameRegionSchema = z.strictObject({
  regionId: setupIdSchema,
  name: regionNameSchema,
});
export type LobbyRenameRegionPayload = z.infer<typeof lobbyRenameRegionSchema>;

export const lobbyEditTaskPointsSchema = z.strictObject({
  add: z.array(latLngSchema).max(MAX_POINTS_ADDED_PER_CALL).optional(),
  remove: z.array(setupIdSchema).max(MAX_POINTS_REMOVED_PER_CALL).optional(),
  regenerate: z.boolean().optional(),
});
export type LobbyEditTaskPointsPayload = z.infer<typeof lobbyEditTaskPointsSchema>;

export const lobbySetNoGoZonesSchema = z.strictObject({
  zones: z
    .array(
      z
        .array(z.tuple([lngSchema, latSchema]))
        .min(MIN_NOGO_VERTICES)
        .max(MAX_NOGO_VERTICES),
    )
    .max(MAX_NOGO_ZONES),
});
export type LobbySetNoGoZonesPayload = z.infer<typeof lobbySetNoGoZonesSchema>;

export const lobbySetBaseSchema = latLngSchema;
export type LobbySetBasePayload = z.infer<typeof lobbySetBaseSchema>;

// ── Phase 4: game flow ──────────────────────────────────────────────────────

/** `game:forceStart`, `game:pause`, `game:resume`, `game:abort` carry nothing. */
export const gameCommandSchema = z.strictObject({});
export type GameCommandPayload = z.infer<typeof gameCommandSchema>;

/** `dev:addBots` (test mode, host): how many in-process bots to add and how imposter bots play. The room's player cap is the real limit. */
const MAX_BOTS_PER_CALL = 11;
export const devAddBotsSchema = z.strictObject({
  count: z.number().int().min(1).max(MAX_BOTS_PER_CALL),
  /** How imposter bots play (default `wander`: they walk and never infect). Applies to the whole room. */
  imposterBehaviour: z.enum(['wander', 'chase']).optional(),
  /** `random`: each bot calls one meeting at a random time (default `off`: bots only join meetings others call). Applies to the whole room. */
  meetings: z.enum(BOT_MEETING_MODES).optional(),
});
export type DevAddBotsPayload = z.infer<typeof devAddBotsSchema>;

/** `dev:advanceClock` (test mode, host, playing): move game time forward, so cooldowns, incubation and the match end can be reached in a test. */
const MAX_ADVANCE_S = 600;
export const devAdvanceClockSchema = z.strictObject({
  seconds: z.number().int().min(1).max(MAX_ADVANCE_S),
});
export type DevAdvanceClockPayload = z.infer<typeof devAdvanceClockSchema>;

// ── Phase 8: meetings ───────────────────────────────────────────────────────

/** `meeting:call` and `meeting:skipDiscussion` carry nothing: the server knows who and when. */
export const meetingCommandSchema = z.strictObject({});
export type MeetingCommandPayload = z.infer<typeof meetingCommandSchema>;

/** `meeting:vote`: a player id, or `'skip'`. A player id never equals `'skip'` (ids are 16+ characters). */
export const meetingVoteSchema = z.strictObject({
  target: z.union([z.literal('skip'), playerIdSchema]),
});
export type MeetingVotePayload = z.infer<typeof meetingVoteSchema>;

// ── Phase 5: tasks ──────────────────────────────────────────────────────────

/** Task ids are server-made 12-character tokens from the URL-safe alphabet. */
const TASK_ID_PATTERN = new RegExp(`^[${escapeForClass(ID_ALPHABET)}]{12,64}$`);
export const taskIdSchema = z.string().regex(TASK_ID_PATTERN);

/** `task:open`, `task:cancel`, `task:reroll` and `dev:autoComplete` name one task. */
export const taskRefSchema = z.strictObject({ taskId: taskIdSchema });
export type TaskRefPayload = z.infer<typeof taskRefSchema>;

/**
 * `task:action` and `task:submit` carry a game-specific body. The envelope is
 * checked here; the server parses the body with the minigame's own schema before
 * it reaches any logic. The depth and size caps keep a hostile body cheap to parse.
 */
const MAX_BODY_BYTES = 2048;
const jsonBodySchema = z.unknown().refine(
  (v) => {
    try {
      return JSON.stringify(v).length <= MAX_BODY_BYTES;
    } catch {
      return false;
    }
  },
  { message: 'Body too large' },
);

export const taskActionSchema = z.strictObject({ taskId: taskIdSchema, action: jsonBodySchema });
export type TaskActionPayload = z.infer<typeof taskActionSchema>;

export const taskSubmitSchema = z.strictObject({ taskId: taskIdSchema, answer: jsonBodySchema });
export type TaskSubmitPayload = z.infer<typeof taskSubmitSchema>;

const REPORT_REASON_MAX = 100;
export const taskReportUnsafeSchema = z.strictObject({
  taskId: taskIdSchema,
  reason: z.string().max(REPORT_REASON_MAX).optional(),
});
export type TaskReportUnsafePayload = z.infer<typeof taskReportUnsafeSchema>;

/**
 * `dev:setMinigames` (test mode, host, lobby): which minigame types new tasks may roll.
 * For testing one game at a time; a type with no game yet is ignored by the server.
 */
export const devSetMinigamesSchema = z.strictObject({
  types: z
    .array(z.enum(['wires', 'lock', 'pattern', 'signal', 'slide', 'crossword', 'keyfetch']))
    .min(1)
    .max(7),
});
export type DevSetMinigamesPayload = z.infer<typeof devSetMinigamesSchema>;

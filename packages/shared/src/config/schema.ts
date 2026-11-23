/**
 * zod schema for every tunable value. Mirrors docs/CONFIG.md: host-editable keys
 * (✅ basic, ⚙️ advanced) carry their documented ranges; fixed keys (🔒) only get
 * sanity checks. Change this file, `defaults.ts` and CONFIG.md together.
 */
import { z } from 'zod';

const int = (min: number, max: number) => z.number().int().min(min).max(max);
const count = () => z.number().int().nonnegative();
const positiveInt = () => z.number().int().positive();
const positive = () => z.number().positive();
const fraction = () => z.number().min(0).max(1);

export const imposterAbilityModeSchema = z.enum(['classes', 'all']);
export const playerVisibilitySchema = z.enum(['nearby', 'regions', 'all']);

const pointsSchema = z.strictObject({
  wires: count(),
  lock: count(),
  pattern: count(),
  signal: count(),
  slide: count(),
  crossword: count(),
  keyfetch: count(),
  coop_pin: count(),
  fake: count(),
});

const imposterAutoRuleSchema = z.strictObject({ maxPlayers: positiveInt(), count: positiveInt() });
const regionCountBucketSchema = z.strictObject({ min: count(), label: z.string().min(1) });

export const gameConfigSchema = z.strictObject({
  // Match
  playTimeMin: int(10, 60),
  targetScore: int(40, 300),
  targetScoreHintPerCrew: positiveInt(),
  minPlayers: positiveInt(),
  maxPlayers: positiveInt(),
  imposterCount: z.union([z.literal('auto'), int(1, 3)]),
  imposterCountAuto: z.array(imposterAutoRuleSchema).min(1),
  minCrewRemaining: positiveInt(),
  imposterAbilityMode: imposterAbilityModeSchema,
  playerVisibility: playerVisibilitySchema,
  testMode: z.boolean(),

  // Lobby and start
  lobbyCodeLength: positiveInt(),
  lobbyCodeAlphabet: z.string().min(2),
  usernameMinLen: positiveInt(),
  usernameMaxLen: positiveInt(),
  startCountdownS: positiveInt(),
  spawnTimeoutS: int(60, 600),
  spawnMinSeparationM: positive(),
  roleRevealS: positiveInt(),
  lobbyIdleTimeoutMin: positiveInt(),

  // Map, regions and visibility
  minBoundaryAreaM2: positive(),
  maxBoundaryAreaM2: positive(),
  regionCount: z.union([z.literal('auto'), int(2, 6)]),
  regionCountAutoMaxAreaM2: z.array(positive()).min(1),
  sectionCentreRatio: fraction(),
  minSectionAreaM2: positive(),
  taskPointsPerSection: positiveInt(),
  taskPointMinSpacingM: positive(),
  baseRadiusM: positive(),
  nearbyRadiusM: int(20, 100),
  regionCountRefreshS: positiveInt(),
  regionCountBuckets: z.array(regionCountBucketSchema).min(1),
  dotAliasRotateS: positiveInt(),

  // Location quality
  maxAccuracyM: positive(),
  staleAfterS: positive(),
  maxSpeedMps: positive(),
  reanchorFixes: positiveInt(),
  locationSendIntervalMs: positiveInt(),
  locationMinMoveM: positive(),
  stationarySendIntervalMs: positiveInt(),
  reachRadiusM: int(8, 30),
  sectionEntryHoldS: positive(),

  // Zone
  zoneGraceS: positive(),
  zonePenaltyPoints: positiveInt(),
  zonePenaltyIntervalS: positive(),

  // Tasks
  taskSlots: positiveInt(),
  coopChance: z.number().min(0).max(0.5),
  coopExpiryS: positiveInt(),
  rerollCooldownS: positiveInt(),
  taskPointReuseCooldownS: positiveInt(),
  taskWrongLockoutS: positive(),
  taskAbandonExtraM: positive(),
  keyFetchMinLegM: positive(),

  // Points
  points: pointsSchema,
  coopPersonalPoints: count(),

  // Infection
  infectionRadiusM: int(3, 15),
  infectionChannelS: int(5, 30),
  infectionGapToleranceS: positive(),
  incubationS: int(0, 180),
  infectionCooldownS: positiveInt(),
  infectionWinPercent: int(40, 100),

  // Imposter abilities
  abilityInitialCooldownS: positiveInt(),
  taskStopCooldownS: positiveInt(),
  taskStopLockS: int(10, 60),
  fakeTaskCooldownS: positiveInt(),
  fakeTaskMaxActive: positiveInt(),
  fakeTaskMinDistanceM: positive(),
  camouflageCooldownS: positiveInt(),
  camouflageDurationS: positiveInt(),
  camouflageCoopExtensionMaxS: positiveInt(),
  coopRecoveryFirst: fraction(),
  coopRecoverySecond: fraction(),
  postMeetingGraceS: positiveInt(),

  // Meetings
  meetingsPerPlayer: int(0, 3),
  meetingCooldownS: positiveInt(),
  meetingStartGraceS: positiveInt(),
  meetingGatherS: positiveInt(),
  meetingDiscussS: int(30, 300),
  meetingVoteS: int(15, 120),
  meetingResultS: positiveInt(),

  // Connectivity and end
  forfeitAfterS: positiveInt(),
  viewThrottleMs: positiveInt(),
  radarIntervalMs: positiveInt(),
});

export type GameConfig = z.infer<typeof gameConfigSchema>;
export type ImposterAbilityMode = z.infer<typeof imposterAbilityModeSchema>;
export type PlayerVisibility = z.infer<typeof playerVisibilitySchema>;

/** Which host settings screen a key appears on: ✅ basic, ⚙️ advanced. */
export type HostConfigTier = 'basic' | 'advanced';

export const HOST_CONFIG_TIER = {
  playTimeMin: 'basic',
  targetScore: 'basic',
  imposterCount: 'basic',
  imposterAbilityMode: 'basic',
  playerVisibility: 'basic',
  testMode: 'basic',
  regionCount: 'basic',
  infectionRadiusM: 'basic',
  meetingsPerPlayer: 'basic',
  meetingDiscussS: 'basic',
  meetingVoteS: 'basic',
  spawnTimeoutS: 'advanced',
  nearbyRadiusM: 'advanced',
  reachRadiusM: 'advanced',
  coopChance: 'advanced',
  infectionChannelS: 'advanced',
  incubationS: 'advanced',
  infectionWinPercent: 'advanced',
  taskStopLockS: 'advanced',
} as const satisfies Partial<Record<keyof GameConfig, HostConfigTier>>;

export type EditableConfigKey = keyof typeof HOST_CONFIG_TIER;

export const EDITABLE_CONFIG_KEYS = Object.keys(HOST_CONFIG_TIER) as EditableConfigKey[];

const editableMask = Object.fromEntries(EDITABLE_CONFIG_KEYS.map((k) => [k, true])) as {
  [K in EditableConfigKey]: true;
};

/** The host-editable subset of the config. */
export const gameConfigEditableSchema = gameConfigSchema.pick(editableMask);
export type GameConfigEditable = z.infer<typeof gameConfigEditableSchema>;

/** Payload of `lobby:updateConfig`: any subset of editable keys, range-checked. */
export const editableConfigPatchSchema = gameConfigEditableSchema.partial();
export type GameConfigEditablePatch = z.infer<typeof editableConfigPatchSchema>;

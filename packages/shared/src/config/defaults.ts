/**
 * Default value of every tunable number. Mirrors the tables in docs/CONFIG.md
 * (same order, same keys). Invariant 6: no magic numbers elsewhere in the code.
 */
import type { GameConfig } from './schema';

export const DEFAULT_CONFIG = {
  // Match
  playTimeMin: 25,
  targetScore: 100,
  targetScoreHintPerCrew: 16,
  minPlayers: 4,
  maxPlayers: 12,
  imposterCount: 'auto',
  /** auto: 4–5 players → 1, 6–9 → 2, 10–12 → 3. */
  imposterCountAuto: [
    { maxPlayers: 5, count: 1 },
    { maxPlayers: 9, count: 2 },
    { maxPlayers: 12, count: 3 },
  ],
  minCrewRemaining: 3,
  imposterAbilityMode: 'classes',
  playerVisibility: 'nearby',
  testMode: false,

  // Lobby and start
  lobbyCodeLength: 6,
  lobbyCodeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  usernameMinLen: 2,
  usernameMaxLen: 16,
  startCountdownS: 5,
  spawnTimeoutS: 300,
  spawnMinSeparationM: 40,
  spawnAttempts: 8,
  roleRevealS: 10,
  lobbyIdleTimeoutMin: 30,
  lobbyIdleSweepS: 60,
  hostDisconnectGraceS: 30,

  // Map, regions and visibility
  minBoundaryAreaM2: 15_000,
  maxBoundaryAreaM2: 3_000_000,
  regionCount: 'auto',
  /** auto: area < 40k m² → 2, < 150k → 3, < 400k → 4, < 1M → 5, otherwise 6. */
  regionCountAutoMaxAreaM2: [40_000, 150_000, 400_000, 1_000_000],
  regionSampleCount: 400,
  regionKmeansIterations: 20,
  minRegionAreaRatio: 0.1,
  regionNameMaxLen: 20,
  sectionCentreRatio: 0.35,
  minSectionAreaM2: 400,
  taskPointsPerSection: 3,
  taskPointMinSpacingM: 20,
  minTaskPointsPerPlayer: 4,
  minRegionsWithPoints: 2,
  baseRadiusM: 30,
  nearbyRadiusM: 40,
  regionCountRefreshS: 30,
  regionCountBuckets: [
    { min: 0, label: '0' },
    { min: 1, label: '1' },
    { min: 2, label: '2–3' },
    { min: 4, label: '4+' },
  ],
  dotAliasRotateS: 300,

  // Location quality
  maxAccuracyM: 30,
  staleAfterS: 10,
  maxSpeedMps: 12,
  reanchorFixes: 3,
  futureFixToleranceS: 5,
  speedCheckMinDtS: 1,
  teleportAccuracyM: 5,
  locationSendIntervalMs: 1000,
  locationMinMoveM: 3,
  stationarySendIntervalMs: 5000,
  reachRadiusM: 15,
  sectionEntryHoldS: 3,

  // Zone (boundary)
  zoneGraceS: 15,
  zonePenaltyPoints: 1,
  zonePenaltyIntervalS: 10,

  // Tasks
  taskSlots: 3,
  coopChance: 0.25,
  coopExpiryS: 360,
  rerollCooldownS: 180,
  taskPointReuseCooldownS: 300,
  taskWrongLockoutS: 3,
  taskAbandonExtraM: 10,
  keyFetchMinLegM: 60,
  taskMinDistanceM: 60,
  /** Types a new task can be. The host can switch some off (at least two stay on). */
  minigamesEnabled: ['wires', 'lock', 'pattern', 'signal', 'slide', 'crossword', 'keyfetch'],
  minigameWeights: {
    wires: 3,
    lock: 3,
    pattern: 3,
    signal: 2,
    slide: 2,
    crossword: 2,
    keyfetch: 1,
  },
  wiresPairs: 4,
  lockDigits: 3,
  lockDigitMax: 5,
  lockMaxGuesses: 8,
  slideShuffleMinMoves: 20,
  slideShuffleMaxMoves: 30,
  patternLength: 5,
  signalKeyFraction: 0.6,
  keyHoldS: 3,
  keyTurnSteps: 3,
  coopPinDigits: 4,

  // Points (SCORING.md)
  points: {
    wires: 4,
    lock: 5,
    pattern: 5,
    signal: 6,
    slide: 7,
    crossword: 8,
    keyfetch: 12,
    coop_pin: 12,
    fake: 0,
  },
  /** Personal credit each co-op participant gets; the team always gets `points.coop_pin`. */
  coopPersonalPoints: 6,

  // Infection
  infectionRadiusM: 8,
  infectionChannelS: 10,
  infectionGapToleranceS: 3,
  incubationS: 60,
  incubationDepartS: 3,
  infectionCooldownS: 60,
  infectionWinPercent: 60,

  // Imposter abilities
  abilityInitialCooldownS: 60,
  taskStopCooldownS: 120,
  taskStopLockS: 30,
  fakeTaskCooldownS: 120,
  fakeTaskMaxActive: 2,
  fakeTaskMinDistanceM: 30,
  fakeTaskMinPointDistanceM: 15,
  camouflageCooldownS: 120,
  camouflageDurationS: 45,
  camouflageCoopExtensionMaxS: 120,
  coopRecoveryFirst: 0.5,
  coopRecoverySecond: 0.25,
  postMeetingGraceS: 30,

  // Meetings
  meetingsPerPlayer: 1,
  meetingCooldownS: 120,
  meetingStartGraceS: 120,
  meetingGatherS: 180,
  meetingDiscussS: 90,
  meetingVoteS: 45,
  meetingResultS: 8,

  // Connectivity and end
  forfeitAfterS: 180,
  viewThrottleMs: 200,
  radarIntervalMs: 1000,
  clockSyncSamples: 5,
  clockSyncIntervalMs: 30_000,
  ackTimeoutMs: 5000,
  tickIntervalMs: 1000,
  socketEventsPerSecond: 10,
  locEventsPerSecond: 2,
  shutdownNoticeMs: 1500,
  slowCommandMs: 50,

  // Bots (test mode)
  botSpeedMps: 1.4,
  botJitterM: 3,
  botStepS: 1,
  botWanderLegM: 60,
  botTaskMinS: 10,
  botTaskMaxS: 30,
  botVoteSkipPercent: 30,
  botMeetingMinS: 150,
  botMeetingMaxS: 400,
  botFakeScatterM: 120,
  botStandInRangeM: 50,
} as const satisfies GameConfig;

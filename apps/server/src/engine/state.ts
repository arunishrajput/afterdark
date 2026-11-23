/**
 * Room state: a plain, serialisable object owned by one Room. The engine never
 * holds session tokens (they live in the session registry), so a view built
 * from this state cannot leak one.
 */
import {
  type AbilityId,
  DEFAULT_CONFIG,
  type EndReason,
  type GameConfig,
  hashSeed,
  type ImposterClass,
  type LatLng,
  type MeetingStage,
  type MeetingTally,
  type Phase,
  type Position,
  type Region,
  type Ring,
  type Role,
  type SectionId,
  type SoloMinigameType,
  type TaskKind,
  type TaskPoint,
  type Winner,
} from '@afterdark/shared';

import type { GameClock } from './clock';

/** The latest accepted GPS fix. Positions live in memory only (Invariant 8). */
export interface StoredFix {
  lat: number;
  lng: number;
  accuracy: number;
  /** Device fix time, server-aligned epoch ms. */
  ts: number;
  /** Server ms when it arrived: staleness is measured on this clock. */
  receivedAt: number;
}

/** A fix rejected by the speed check, kept to detect a consistent new location (re-anchor). */
export interface PendingFix {
  lat: number;
  lng: number;
  ts: number;
}

/** A player's own spawn point (RULES §4). `reached` is sticky once a good fix was within `reachRadiusM`. */
export interface SpawnState {
  lat: number;
  lng: number;
  reached: boolean;
}

/** Out-of-bounds bookkeeping (RULES §9), on the game clock so a pause freezes it. */
export interface ZoneState {
  /** Game ms when the player went out of bounds. */
  outSince: number;
  /** Penalty ticks already charged for this stay. */
  penalties: number;
}

/** A minigame the player has opened: the puzzle and, server-side only, its solution. */
export interface OpenTaskState {
  puzzle: unknown;
  solution: unknown;
  /** Progress of a multi-step game (the lock's guess count), built by the game's `act`. */
  progress?: unknown;
  /** Game ms until which a submit is refused after a wrong answer. */
  lockedUntilGameMs?: number;
}

/**
 * One task a player holds (TASKS §1). The minigame `type` is hidden from the
 * client until the task is opened; everything else a view shows comes from the
 * stage. A fake task (Phase 9) is the same object with `fake` set.
 */
export interface TaskState {
  /** Server-made, 16 URL-safe symbols (the same format for real and fake tasks). */
  id: string;
  kind: TaskKind;
  /** The pool point this task sits on; absent for a fake (it has its own spot). */
  pointId?: string;
  lat: number;
  lng: number;
  regionId: string;
  section: SectionId;
  type: SoloMinigameType;
  fake?: true;
  /** A fake only: the Phantom who planted it. Server-only (it frees that Phantom's count when the task goes). */
  fakeOwnerId?: string;
  /** `assigned` → `pin` once the player held the section for `sectionEntryHoldS`. Never goes back. */
  stage: 'assigned' | 'pin';
  /** Game ms when the current run of good fixes inside the section began. */
  holdSince?: number;
  /** Within `reachRadiusM` of the pin on a good fix right now. */
  atPin: boolean;
  open?: OpenTaskState;
}

/** A fake task waiting for the next crew slot that refills (RULES §7.3). */
export interface QueuedFake {
  /** The id the task will carry once a slot takes it (same format as any task id). */
  id: string;
  /** The Phantom who planted it: ejecting them removes it, and it counts toward their `fakeTaskMaxActive`. */
  ownerId: string;
  lat: number;
  lng: number;
  regionId: string;
  section: SectionId;
}

/** An Infect channel in progress (RULES §7.1.2). Deadlines are game ms. */
export interface InfectChannel {
  targetId: string;
  /** Game ms when the channel completes, if both stay in range. */
  endsAtGameMs: number;
  /** Game ms when the current out-of-range gap began; absent while in range. */
  gapSince?: number;
  /** In range at the last evaluation (the imposter's ring shows it). */
  inRange: boolean;
}

/** An imposter's Infect state (RULES §7.1). */
export interface InfectState {
  /** Game ms when Infect is ready again (pushed back while the imposter is out of bounds, RULES §9.3). */
  readyAtGameMs: number;
  channel?: InfectChannel;
  /** Successful infections, for the results screen's top infector (SCORING). */
  completed: number;
}

/** One class ability's cooldown (RULES §7.2–7.3). Game ms, so a pause and a meeting freeze it. */
export interface AbilityRuntime {
  /** Game ms when the ability is ready again (pushed back while the imposter is out of bounds, RULES §9.3). */
  readyAtGameMs: number;
}

/** What a target carries between the end of a channel and becoming infected (RULES §7.1.3). Server-only. */
export interface ExposureState {
  /** The imposter whose channel exposed them: incubation starts when this imposter leaves. */
  byId: string;
  /** Game ms when the exposing imposter went out of range; absent while they are in range. */
  awaySince?: number;
  /** Game ms when incubation ends; absent until the imposter has been away for `incubationDepartS`. */
  incubationEndsAtGameMs?: number;
}

export interface PlayerState {
  id: string;
  username: string;
  ready: boolean;
  connected: boolean;
  /** Server ms of the latest disconnect (cleared on reconnect). */
  disconnectedAt?: number;
  /** An in-process test bot (`dev:addBots`). Never the host while a human could be. */
  bot?: true;
  /** Left mid-game: a permanent disconnect (PROTOCOL `lobby:leave`). */
  left?: true;
  loc?: StoredFix;
  locPending?: PendingFix[];
  /** Spawn phase onwards. */
  spawn?: SpawnState;
  /** Roles are assigned at the reveal (RULES §5). Server-only; views project them per viewer. */
  role?: Role;
  tag?: string;
  /** Imposters only. */
  classes?: ImposterClass[];
  personalScore?: number;
  /** Crew only, from the start of play: `taskSlots` tasks, refilled as they leave (RULES §6.1). */
  tasks?: TaskState[];
  /** Game ms when this player may reroll again (RULES §6.5). */
  rerollReadyAtGameMs?: number;
  /**
   * Infection status. Never projected into the player's own view or any crew view
   * (RULES §7.1.6): only imposters learn it, through `projectImposter` and the radar.
   */
  infection?: 'exposed' | 'infected';
  /** Present exactly while `infection === 'exposed'`. */
  exposure?: ExposureState;
  /** Imposters only, from the role reveal. */
  infect?: InfectState;
  /** Imposters only: the class abilities that exist in this build (Phase 9: Task Stop, Fake Task). */
  abilities?: Partial<Record<AbilityId, AbilityRuntime>>;
  zone?: ZoneState;
  /** Ejected by a vote (MEETINGS §5): sees public information only, and is nobody's target. */
  spectator?: true;
  /** Set with `spectator`: what the ejection revealed. Public from then on (ADR-019). */
  revealedRole?: Role;
  /** Crew only: ejected while healthy or exposed, so counted as compromised toward V3 (RULES §8). An infected crew member who is ejected is already counted. */
  wronglyEjected?: true;
  /** Meetings this player has called (allowance `meetingsPerPlayer`). */
  meetingsCalled?: number;
}

/** A region with its compass frame and the area of each of its 9 sections (computed once per layout). */
export interface SetupRegion extends Region {
  sections: { id: SectionId; areaM2: number }[];
}

/** Players per region at the last refresh (RULES: region counts are stale on purpose). */
export interface RegionCountSnapshot {
  /** Server ms of the refresh. */
  at: number;
  /** Which region each counted player was in; players not listed were not counted. */
  regionOf: Record<string, string>;
}

/** Everything the host sets up besides the boundary (MAP_AND_REGIONS §1). */
export interface MapSetupState {
  /** Seed of the region layout (the host can ask for a new one). */
  seed: number;
  /** Seed of the auto task points (changes when only the points are regenerated). */
  poolSeed: number;
  noGo: Ring[];
  regions: SetupRegion[];
  taskPoints: TaskPoint[];
  base?: LatLng;
  /** True while the Base is the generated default, so a new layout may move it. */
  baseIsDefault: boolean;
  /** Next number for task-point ids (`p1`, `p2`…). */
  nextPointNo: number;
}

/** A running meeting (MEETINGS §3). Stage timers are server ms: the meeting is the one thing that runs while game time is stopped. */
export interface MeetingState {
  stage: MeetingStage;
  calledById: string;
  /** Server ms when the meeting was called (forfeit timers are credited this long). */
  startedAt: number;
  /** Server ms when this stage ends if nothing finishes it early. */
  stageEndsAt: number;
  /** Server ms when the host paused; present only while paused, so the stage timer can be pushed back on resume. */
  pausedAt?: number;
  /** Who has arrived within `baseRadiusM` on a good fix (sticky). */
  gathered: string[];
  /** Who tapped "Skip to vote" during Discuss. */
  skips: string[];
  /** Cast votes: voter id → candidate id or `'skip'`. Never projected (ROLES.md). */
  votes: Record<string, string>;
  /** Set when the vote ends (`result` stage). */
  tallies?: MeetingTally[];
  ejectedId?: string;
}

/** The running game (from the role reveal). */
export interface GameState {
  clock: GameClock;
  /** Server ms when the role reveal ends and play begins. */
  revealEndsAt: number;
  /** Server ms when roles were assigned: forfeit timers count from here (RULES §10.6). */
  rolesAssignedAt: number;
  /** Fixed when roles are assigned; never changes (RULES §12). */
  originalCrewCount: number;
  threshold: number;
  teamScore: number;
  /** Counts task rolls, so each roll has its own seeded RNG (ids, sections, points, types). */
  taskSeq: number;
  /** Game ms when each pool point last left a player's hands (completed or rerolled): it rests for `taskPointReuseCooldownS`. */
  pointUsedAtGameMs: Record<string, number>;
  /** Fakes waiting for a free crew slot, oldest first (TASKS §2). */
  fakeQueue: QueuedFake[];
  /** Game-time deadline of the match (`playTimeMin`). */
  matchEndsAtGameMs: number;
  /** Game ms of the last infection update, to freeze cooldowns while an imposter is out of bounds. */
  lastInfectGameMs: number;
  /** A Task Stop lock (RULES §7.2): until this game ms nobody can open or submit a task. Game time, so a meeting freezes it (E23). */
  taskLock?: { untilGameMs: number };
  /** The meeting in progress, if any. Game time is stopped while it exists. */
  meeting?: MeetingState;
  /** Game ms when the last meeting ended (the next one waits `meetingCooldownS`). */
  lastMeetingEndedGameMs?: number;
}

export interface GameResult {
  winner: Winner;
  reason: EndReason;
}

export interface RoomState {
  code: string;
  phase: Phase;
  hostId: string;
  config: GameConfig;
  /** Join order: earliest first (host hand-over picks from the front). */
  players: PlayerState[];
  /** Server ms when the start countdown ends. */
  countdownEndsAt?: number;
  /** Server ms when the spawn timeout ends (`spawning` only). */
  spawnEndsAt?: number;
  /** Roles, tags and classes: from the reveal on. */
  game?: GameState;
  /** Set when the room is `ended`. */
  result?: GameResult;
  /** Server ms since when nobody has been connected (idle cleanup, RULES §3.9). */
  emptySince?: number;
  /** Server-level `ALLOW_TEST_MODE`: may the host enable `testMode`? */
  allowTestMode: boolean;
  /** The playable area: a closed `[lng, lat]` ring and its area. */
  boundary?: { ring: Position[]; areaM2: number };
  /** Regions, task points, no-go zones and the Base. */
  setup: MapSetupState;
  regionCounts?: RegionCountSnapshot;
  /** Secret input to the rotating radar aliases. Never put it in a view. */
  radarSalt: string;
  /**
   * Secret seed of the spawns and roles. The lobby code is public, so it must not
   * seed anything secret: this derives from the random room salt (ADR-050).
   */
  secretSeed: number;
}

export interface CreateRoomInput {
  code: string;
  hostId: string;
  username: string;
  allowTestMode: boolean;
  radarSalt: string;
  config?: GameConfig;
}

export function createRoomState(input: CreateRoomInput): RoomState {
  return {
    code: input.code,
    phase: 'lobby',
    hostId: input.hostId,
    config: structuredClone(input.config ?? DEFAULT_CONFIG),
    players: [{ id: input.hostId, username: input.username, ready: false, connected: true }],
    allowTestMode: input.allowTestMode,
    setup: {
      seed: hashSeed(input.code),
      poolSeed: hashSeed(input.code),
      noGo: [],
      regions: [],
      taskPoints: [],
      baseIsDefault: true,
      nextPointNo: 1,
    },
    radarSalt: input.radarSalt,
    secretSeed: hashSeed(`game|${input.radarSalt}`),
  };
}

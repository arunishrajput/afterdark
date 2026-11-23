/**
 * Room state: a plain, serialisable object owned by one Room. The engine never
 * holds session tokens (they live in the session registry), so a view built
 * from this state cannot leak one.
 */
import {
  DEFAULT_CONFIG,
  type EndReason,
  type GameConfig,
  hashSeed,
  type ImposterClass,
  type LatLng,
  type Phase,
  type Position,
  type Region,
  type Ring,
  type Role,
  type SectionId,
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

export interface PlayerState {
  id: string;
  username: string;
  ready: boolean;
  connected: boolean;
  /** Server ms of the latest disconnect (cleared on reconnect). */
  disconnectedAt?: number;
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
  /**
   * Infection status (Phase 7 fills it in). It lives in the state from Phase 4 so
   * the leak tests can prove a crew view looks the same for any status.
   */
  infection?: 'exposed' | 'infected';
  zone?: ZoneState;
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
  /** Game-time deadline of the match (`playTimeMin`). */
  matchEndsAtGameMs: number;
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

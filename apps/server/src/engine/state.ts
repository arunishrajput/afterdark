/**
 * Room state: a plain, serialisable object owned by one Room. The engine never
 * holds session tokens (they live in the session registry), so a view built
 * from this state cannot leak one.
 */
import { DEFAULT_CONFIG, type GameConfig, type Phase, type Position } from '@afterdark/shared';

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
  /** Server ms since when nobody has been connected (idle cleanup, RULES §3.9). */
  emptySince?: number;
  /** Server-level `ALLOW_TEST_MODE`: may the host enable `testMode`? */
  allowTestMode: boolean;
  /** The playable area: a closed `[lng, lat]` ring and its area. */
  boundary?: { ring: Position[]; areaM2: number };
  /** Secret input to the rotating radar aliases. Never put it in a view. */
  radarSalt: string;
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
    radarSalt: input.radarSalt,
  };
}

/**
 * Per-player view snapshots (PROTOCOL.md › PlayerView). The server builds these
 * from an allow-list in `projectView()`; every field must be allowed by the
 * ROLES.md visibility matrix and covered by a leak test.
 */
import type { GameConfigEditable } from '../config/schema';
import type { Position } from '../geo/types';
import type { Phase, PlayerStatus } from './domain';

/**
 * Config every player sees in the lobby: the host-editable keys. Fixed (🔒)
 * keys are constants, so clients read them from `DEFAULT_CONFIG` (ADR-035).
 */
export type GameConfigPublic = GameConfigEditable;

/** One roster row. Public to everyone in the lobby. */
export interface PublicPlayer {
  id: string;
  username: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  status: PlayerStatus;
}

/** Public setup data: every player sees the map (MAP_AND_REGIONS §1). Phase 3 adds regions, points, Base. */
export interface MapSetupPublic {
  /** The playable boundary, once the host has set one. */
  boundary?: { ring: Position[]; areaM2: number };
}

export type LocationQuality = 'good' | 'weak' | 'stale';

/** The player's own latest accepted fix, as the server sees it. */
export interface LocationView {
  lat: number;
  lng: number;
  accuracy: number;
  quality: LocationQuality;
  /** Outside the boundary (display only until Phase 4 adds penalties). */
  oob: boolean;
}

export interface LobbyView {
  code: string;
  phase: Phase;
  hostId: string;
  testMode: boolean;
  config: GameConfigPublic;
  map: MapSetupPublic;
  /** In join order. */
  players: PublicPlayer[];
  /** Server epoch ms when the start countdown ends; absent when none is running. */
  countdownEndsAt?: number;
}

export interface MeView {
  id: string;
  username: string;
  isHost: boolean;
  ready: boolean;
  status: PlayerStatus;
  /** Absent until the server has accepted a fix from this player. */
  location?: LocationView;
}

export interface PlayerView {
  /** Increases by one every time this player's view content changes. */
  v: number;
  /** Server epoch ms when the snapshot was built. */
  serverNow: number;
  lobby: LobbyView;
  me: MeView;
}

export type DotFlag = 'oob' | 'stale' | 'ally' | 'exposed' | 'infected';

/** An anonymous position: no player id, no username, and an alias that rotates (MAP_AND_REGIONS §6). */
export interface AnonDot {
  alias: string;
  lat: number;
  lng: number;
  flags: DotFlag[];
}

export interface RadarPayload {
  dots: AnonDot[];
  /** Server epoch ms. */
  at: number;
}

/** Toast / overlay triggers (PROTOCOL.md › GameEvent). */
export type GameEvent =
  | { type: 'lobby.countdown'; endsAt: number }
  | { type: 'lobby.countdownCancelled' }
  /** The host changed the settings, so everyone was un-readied (RULES §3.6). */
  | { type: 'lobby.configChanged' }
  /** The host changed the boundary, so everyone was un-readied (RULES §3.6). */
  | { type: 'lobby.mapChanged' };

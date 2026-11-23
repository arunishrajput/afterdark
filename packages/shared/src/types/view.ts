/**
 * Per-player view snapshots (PROTOCOL.md › PlayerView). The server builds these
 * from an allow-list in `projectView()`; every field must be allowed by the
 * ROLES.md visibility matrix and covered by a leak test.
 */
import type { GameConfigEditable } from '../config/schema';
import type { TaskPointSource } from '../geo/pool';
import type { SectionId } from '../geo/sections';
import type { LatLng, MultiPolygonCoords, Position, Ring } from '../geo/types';
import type { EndReason, ImposterClass, Phase, PlayerStatus, Role, Winner } from './domain';

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

/** One of a region's 9 sections: its area and whether tasks can be sent there. */
export interface SectionStat {
  id: SectionId;
  areaM2: number;
  usable: boolean;
}

/** A region with its compass frame. Section polygons are not sent: clients derive them from this (`sectionShapes`). */
export interface RegionPublic {
  id: string;
  name: string;
  /** `[lng, lat]` multi-polygon (several parts when a no-go zone splits the region). */
  area: MultiPolygonCoords;
  origin: LatLng;
  rhoM: number;
  areaM2: number;
  sections: SectionStat[];
}

/** A task point as the lobby shows it for safety review. Never sent once the game has started. */
export interface TaskPointPublic {
  id: string;
  lat: number;
  lng: number;
  regionId: string;
  section: SectionId;
  source: TaskPointSource;
}

/** Public setup data: every player sees the map (MAP_AND_REGIONS §1). */
export interface MapSetupPublic {
  /** The playable boundary, once the host has set one. */
  boundary?: { ring: Position[]; areaM2: number };
  regions: RegionPublic[];
  /** Lobby only: the pool is hidden during play. */
  taskPoints: TaskPointPublic[];
  noGo: Ring[];
  base?: LatLng;
}

/** Players per region, bucketed (`regionCountBuckets` labels), recounted every `regionCountRefreshS`. */
export interface RegionCount {
  regionId: string;
  bucket: string;
}

/** How the spawn phase is going: public numbers, no names (RULES §4). */
export interface SpawnProgress {
  reached: number;
  total: number;
  /** Server epoch ms when the spawn timeout ends. */
  endsAt: number;
}

/** The match clock as a display pair: remaining time is `endsAt − (pausedAt ?? now)` (ARCHITECTURE §3). */
export interface ClockView {
  /** Server epoch ms when game time runs out, if it keeps running from now. */
  endsAt: number;
  /** Present while the clock is frozen (a host pause). */
  pausedAt?: number;
}

/** Why and how a game ended (the full results screen is Phase 12). */
export interface ResultView {
  winner: Winner;
  reason: EndReason;
}

/**
 * Public game state. Every player gets the same values (ROLES.md visibility
 * matrix): nothing here depends on role or infection. The optional groups appear
 * with the phase that needs them.
 */
export interface GameView {
  regionCounts: RegionCount[];
  /** `spawning` only. */
  spawn?: SpawnProgress;
  /** `reveal` only: server epoch ms when play begins. */
  revealEndsAt?: number;
  /** `reveal` onwards: infection boxes, team score and the match clock. */
  clock?: ClockView;
  teamScore?: number;
  targetScore?: number;
  compromised?: number;
  threshold?: number;
  crewCount?: number;
  meetingsLeft?: number;
  /** `ended` only. */
  result?: ResultView;
}

export type LocationQuality = 'good' | 'weak' | 'stale';

/** The player's own latest accepted fix, as the server sees it. */
export interface LocationView {
  lat: number;
  lng: number;
  accuracy: number;
  quality: LocationQuality;
  /** Outside the boundary or inside a no-go zone (RULES §9). */
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

/** The viewer's own spawn point (spawn phase onwards; nobody else's is ever sent). */
export interface SpawnView {
  lat: number;
  lng: number;
  reached: boolean;
}

/** The viewer's own zone state (RULES §9): same shape for every role. */
export interface ZoneView {
  oob: boolean;
  /** Server epoch ms when penalties start; only while out of bounds, inside the grace and not paused. */
  graceEndsAt?: number;
}

/** Another imposter, as an imposter sees them (ROLES.md: username, tag and class). */
export interface ImposterAlly {
  playerId: string;
  username: string;
  tag: string;
  classes: ImposterClass[];
}

/** Imposter-only information. A crew view has no `imposter` key at all. */
export interface ImposterView {
  classes: ImposterClass[];
  allies: ImposterAlly[];
}

export interface MeView {
  id: string;
  username: string;
  isHost: boolean;
  ready: boolean;
  status: PlayerStatus;
  /** Absent until the server has accepted a fix from this player. */
  location?: LocationView;
  /** Spawn phase onwards. */
  spawn?: SpawnView;
  /** `reveal` onwards: the viewer's own secret tag, role, and (imposters only) the imposter block. */
  tag?: string;
  role?: Role;
  imposter?: ImposterView;
  /** `reveal` onwards. */
  personalScore?: number;
  /** `playing` onwards. */
  zone?: ZoneView;
}

export interface PlayerView {
  /** Increases by one every time this player's view content changes. */
  v: number;
  /** Server epoch ms when the snapshot was built. */
  serverNow: number;
  lobby: LobbyView;
  me: MeView;
  /** Present once the lobby has a region layout (counts are shown in the lobby for testing). */
  game?: GameView;
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
  | { type: 'lobby.mapChanged' }
  /** The countdown ended but the game could not start (E3: the area is too small to spread everyone out). */
  | { type: 'lobby.startFailed'; reason: 'spawns' }
  | { type: 'game.spawnStarted' }
  | { type: 'game.rolesRevealed' }
  | { type: 'game.playStarted' }
  | { type: 'game.paused' }
  | { type: 'game.resumed' }
  | { type: 'game.ended'; winner: Winner; reason: EndReason }
  /** Private to the player who is out of bounds (RULES §9.2). */
  | { type: 'zone.warning' }
  | { type: 'zone.penalty'; points: number };

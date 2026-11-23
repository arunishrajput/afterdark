/**
 * Per-player view snapshots (PROTOCOL.md › PlayerView). The server builds these
 * from an allow-list in `projectView()`; every field must be allowed by the
 * ROLES.md visibility matrix and covered by a leak test.
 */
import type { GameConfigEditable } from '../config/schema';
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

export interface LobbyView {
  code: string;
  phase: Phase;
  hostId: string;
  testMode: boolean;
  config: GameConfigPublic;
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
}

export interface PlayerView {
  /** Increases by one every time this player's view content changes. */
  v: number;
  /** Server epoch ms when the snapshot was built. */
  serverNow: number;
  lobby: LobbyView;
  me: MeView;
}

/** Toast / overlay triggers (PROTOCOL.md › GameEvent). */
export type GameEvent =
  | { type: 'lobby.countdown'; endsAt: number }
  | { type: 'lobby.countdownCancelled' }
  /** The host changed the settings, so everyone was un-readied (RULES §3.6). */
  | { type: 'lobby.configChanged' };

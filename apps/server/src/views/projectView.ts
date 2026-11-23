/**
 * Per-player views (ARCHITECTURE §4). Every field is copied explicitly from an
 * allow-list that follows the ROLES.md visibility matrix: never spread a server
 * object into a view. Every new field needs a leak-test assertion.
 */
import {
  EDITABLE_CONFIG_KEYS,
  type GameConfig,
  type GameConfigPublic,
  type LocationView,
  type MapSetupPublic,
  type PlayerView,
  pointInRing,
  type PublicPlayer,
} from '@afterdark/shared';

import type { PlayerState, RoomState } from '../engine/state';
import { fixQuality } from '../engine/systems/location';

/** The view without the per-send envelope (`v`, `serverNow`), so it can be diffed. */
export type PlayerViewBody = Omit<PlayerView, 'v' | 'serverNow'>;

function projectConfig(config: GameConfig): GameConfigPublic {
  return Object.fromEntries(EDITABLE_CONFIG_KEYS.map((k) => [k, config[k]])) as GameConfigPublic;
}

function projectPlayer(p: PlayerState, hostId: string): PublicPlayer {
  return {
    id: p.id,
    username: p.username,
    isHost: p.id === hostId,
    ready: p.ready,
    connected: p.connected,
    status: 'active',
  };
}

function projectMap(state: RoomState): MapSetupPublic {
  const { boundary } = state;
  return boundary ? { boundary: { ring: boundary.ring, areaM2: boundary.areaM2 } } : {};
}

/** Only the viewer's own fix, and only what the lobby UI needs from it. */
function projectOwnLocation(
  state: RoomState,
  me: PlayerState,
  now: number,
): LocationView | undefined {
  const { loc } = me;
  if (!loc) return undefined;
  return {
    lat: loc.lat,
    lng: loc.lng,
    accuracy: loc.accuracy,
    quality: fixQuality(loc, now, state.config),
    oob: state.boundary ? !pointInRing(loc, state.boundary.ring) : false,
  };
}

export function projectView(state: RoomState, playerId: string, now: number): PlayerViewBody {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) throw new Error('projectView: player is not in this room');
  const location = projectOwnLocation(state, me, now);
  return {
    lobby: {
      code: state.code,
      phase: state.phase,
      hostId: state.hostId,
      testMode: state.config.testMode,
      config: projectConfig(state.config),
      map: projectMap(state),
      players: state.players.map((p) => projectPlayer(p, state.hostId)),
      ...(state.countdownEndsAt === undefined ? {} : { countdownEndsAt: state.countdownEndsAt }),
    },
    me: {
      id: me.id,
      username: me.username,
      isHost: me.id === state.hostId,
      ready: me.ready,
      status: 'active',
      ...(location ? { location } : {}),
    },
  };
}

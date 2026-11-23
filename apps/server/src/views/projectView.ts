/**
 * Per-player views (ARCHITECTURE §4). Every field is copied explicitly from an
 * allow-list that follows the ROLES.md visibility matrix: never spread a server
 * object into a view. Every new field needs a leak-test assertion.
 */
import {
  EDITABLE_CONFIG_KEYS,
  type GameConfig,
  type GameConfigPublic,
  type PlayerView,
  type PublicPlayer,
} from '@afterdark/shared';

import type { PlayerState, RoomState } from '../engine/state';

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

export function projectView(state: RoomState, playerId: string): PlayerViewBody {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) throw new Error('projectView: player is not in this room');
  return {
    lobby: {
      code: state.code,
      phase: state.phase,
      hostId: state.hostId,
      testMode: state.config.testMode,
      config: projectConfig(state.config),
      players: state.players.map((p) => projectPlayer(p, state.hostId)),
      ...(state.countdownEndsAt === undefined ? {} : { countdownEndsAt: state.countdownEndsAt }),
    },
    me: {
      id: me.id,
      username: me.username,
      isHost: me.id === state.hostId,
      ready: me.ready,
      status: 'active',
    },
  };
}

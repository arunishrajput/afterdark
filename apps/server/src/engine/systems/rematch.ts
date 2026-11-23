/**
 * Play again (RULES §12, Phase 12): the host takes everybody from the results back to the lobby
 * with the same map, setup and config. Each player is rebuilt from the few fields that outlive a
 * game, so nothing of the last game (role, tag, score, tasks, infection, ejection, walk) survives.
 * A fresh `salt` re-seeds the secrets, so the next game's roles and spawns are not the last one's
 * (the engine is pure: the socket layer draws the salt). Pure.
 */
import { hashSeed } from '@afterdark/shared';

import type { PlayerState, RoomState } from '../state';
import { type Effect, RuleError } from '../types';

const MS_PER_S = 1000;

/** Players who are not coming back: they left, or have been disconnected for longer than `rematchDropAfterS`. */
function goneForGood(state: RoomState, p: PlayerState, now: number): boolean {
  if (p.left) return true;
  if (p.connected || p.disconnectedAt === undefined) return false;
  return now - p.disconnectedAt > state.config.rematchDropAfterS * MS_PER_S;
}

/** What a player keeps between games: who they are, their connection, their last position and whether they are a bot. */
function fresh(p: PlayerState): PlayerState {
  return {
    id: p.id,
    username: p.username,
    ready: false,
    connected: p.connected,
    ...(p.disconnectedAt === undefined ? {} : { disconnectedAt: p.disconnectedAt }),
    ...(p.bot ? { bot: p.bot } : {}),
    ...(p.loc ? { loc: p.loc } : {}),
  };
}

export function playAgain(
  state: RoomState,
  playerId: string,
  salt: string,
  now: number,
  effects: Effect[],
): void {
  if (state.hostId !== playerId) throw new RuleError('NOT_HOST', 'Only the host can do that');
  if (state.phase !== 'ended') {
    throw new RuleError('WRONG_PHASE', 'You can play again once the game has ended');
  }
  const staying: PlayerState[] = [];
  for (const p of state.players) {
    if (!goneForGood(state, p, now)) staying.push(fresh(p));
    // Someone who left already had their session revoked; someone merely disconnected has one to end.
    else if (!p.left) effects.push({ kind: 'removed', playerId: p.id, reason: 'left' });
  }
  state.players = staying;
  delete state.game;
  delete state.result;
  delete state.countdownEndsAt;
  delete state.spawnEndsAt;
  state.phase = 'lobby';
  state.radarSalt = salt;
  state.secretSeed = hashSeed(`game|${salt}`);
}

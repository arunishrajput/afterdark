/** Host controls during a game (RULES §11): force start, pause, resume, abort. */
import { pauseClock, resumeClock } from '../clock';
import type { RoomState } from '../state';
import { type Effect, RuleError } from '../types';
import { endGame } from './end';
import { beginReveal } from './game';

function requireHost(state: RoomState, playerId: string): void {
  if (state.hostId !== playerId) throw new RuleError('NOT_HOST', 'Only the host can do that');
}

function requirePlaying(state: RoomState): NonNullable<RoomState['game']> {
  if (state.phase !== 'playing' || !state.game) {
    throw new RuleError('WRONG_PHASE', 'Only possible while the game is being played');
  }
  return state.game;
}

/** Spawn phase only: give everyone a role now, even if some have not reached their spawn (E1). */
export function forceStart(
  state: RoomState,
  playerId: string,
  now: number,
  effects: Effect[],
): void {
  requireHost(state, playerId);
  if (state.phase !== 'spawning') {
    throw new RuleError('WRONG_PHASE', 'Force start only works while players walk to their spawns');
  }
  beginReveal(state, now, effects);
}

export function pause(state: RoomState, playerId: string, now: number, effects: Effect[]): void {
  requireHost(state, playerId);
  const { clock } = requirePlaying(state);
  if (clock.reasons.includes('host')) return;
  pauseClock(clock, 'host', now);
  effects.push({ kind: 'event', to: 'all', event: { type: 'game.paused' } });
}

export function resume(state: RoomState, playerId: string, now: number, effects: Effect[]): void {
  requireHost(state, playerId);
  const { clock } = requirePlaying(state);
  if (!clock.reasons.includes('host')) return;
  resumeClock(clock, 'host', now);
  effects.push({ kind: 'event', to: 'all', event: { type: 'game.resumed' } });
}

/** Ends the game with no winner (V6), from any game phase before it has ended. */
export function abort(state: RoomState, playerId: string, effects: Effect[]): void {
  requireHost(state, playerId);
  if (state.phase === 'lobby' || state.phase === 'ended') {
    throw new RuleError('WRONG_PHASE', 'There is no game to abort');
  }
  endGame(state, null, 'abort', effects);
}

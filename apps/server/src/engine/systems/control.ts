/** Host controls during a game (RULES §11): force start, pause, resume, abort. */
import { MINIGAMES, type SoloMinigameType } from '@afterdark/shared';

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

/** `dev:setMinigames` (test mode, host, lobby): which types new tasks may roll. Types without a game are dropped. */
export function setMinigames(state: RoomState, playerId: string, types: SoloMinigameType[]): void {
  if (!state.config.testMode) throw new RuleError('NOT_ALLOWED', 'Test mode is off');
  requireHost(state, playerId);
  if (state.phase !== 'lobby') throw new RuleError('WRONG_PHASE', 'Choose minigames in the lobby');
  const playable = types.filter((t) => MINIGAMES[t] !== undefined);
  if (playable.length === 0)
    throw new RuleError('INVALID_PAYLOAD', 'None of those games exist yet');
  state.config.minigamesEnabled = [...new Set(playable)];
}

const MS_PER_S = 1000;

/**
 * `dev:advanceClock` (test mode, host, playing): game time jumps forward by `seconds`, so every
 * game-time deadline (cooldowns, channels, incubation, the match end) gets closer by that much.
 * It exists so an end-to-end test can reach "Infect is ready" and "incubation is over" without
 * waiting minutes (ADR-070). A paused game does not move.
 */
export function advanceClock(state: RoomState, playerId: string, seconds: number): void {
  if (!state.config.testMode) throw new RuleError('NOT_ALLOWED', 'Test mode is off');
  requireHost(state, playerId);
  const { clock } = requirePlaying(state);
  if (clock.reasons.length > 0) throw new RuleError('PAUSED', 'The clock is stopped');
  clock.gameMs += seconds * MS_PER_S;
}

/**
 * Saboteur: Task Stop (RULES §7.2, E11, E12, E23). Every minigame in progress
 * resets and nobody can open, play or submit a task for `taskStopLockS`. The
 * lock is a game-time deadline, so a meeting or a host pause freezes it. Reveals
 * and picked-up keys are kept. The event is public and says nothing about who.
 */
import { gameNow, wallTimeOf } from '../clock';
import type { PlayerState, RoomState } from '../state';
import { type Effect, RuleError } from '../types';
import { resetCoops } from './coopUpkeep';
import { resetAllOpen } from './tasks';

const MS_PER_S = 1000;

/** Is a Task Stop lock running right now? */
export function isTaskLocked(state: RoomState, now: number): boolean {
  const game = state.game;
  return game?.taskLock !== undefined && gameNow(game.clock, now) < game.taskLock.untilGameMs;
}

/** Task commands call this: a jammed system rejects open, action and submit (E11). */
export function requireTasksUnlocked(state: RoomState, now: number): void {
  if (isTaskLocked(state, now)) throw new RuleError('TASKS_LOCKED', 'Systems jammed');
}

/** E12: a second Task Stop while a lock is running is refused. */
export function checkTaskStop(state: RoomState, now: number): void {
  if (isTaskLocked(state, now)) throw new RuleError('NOT_ALLOWED', 'Systems are already jammed');
}

export function activateTaskStop(
  state: RoomState,
  actor: PlayerState,
  now: number,
  effects: Effect[],
): void {
  const game = state.game;
  if (!game) throw new RuleError('WRONG_PHASE', 'No game is running');
  const untilGameMs = gameNow(game.clock, now) + state.config.taskStopLockS * MS_PER_S;
  game.taskLock = { untilGameMs };
  for (const p of state.players) resetAllOpen(p, 'sabotage', effects);
  // A co-op puzzle in progress is thrown away too: its session waits for its starter again (RULES §7.2).
  resetCoops(state, 'sabotage', effects);
  const until = wallTimeOf(game.clock, untilGameMs, now) ?? now;
  effects.push({ kind: 'event', to: 'all', event: { type: 'sabotage.started', until } });
  effects.push({
    kind: 'reply',
    playerId: actor.id,
    reply: { type: 'taskStop', ack: { lockEndsAt: until } },
  });
}

/** Drops a lock whose time is up, so the views stop showing it. Runs from `advance()`. */
export function expireTaskLock(state: RoomState, now: number): void {
  if (state.game?.taskLock && !isTaskLocked(state, now)) delete state.game.taskLock;
}

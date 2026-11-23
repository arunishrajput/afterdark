/**
 * The game state machine (RULES §4–§5, §12): spawning → reveal → playing → ended.
 * `advance` runs after every command and every tick, so a fix that completes
 * the spawn phase moves the game on within the same call.
 */
import { startClock } from '../clock';
import type { RoomState } from '../state';
import type { Effect } from '../types';
import { endGame } from './end';
import { activePlayers } from './players';
import { assignRoles } from './roles';
import { spawnPhaseDone, updateSpawnReach } from './spawn';
import { assignInitialTasks, updateTasks } from './tasks';
import { checkVictory } from './victory';
import { updateZone } from './zone';

/** spawning → reveal. Called when everyone is in position, on timeout, or by the host's force start. */
export function beginReveal(state: RoomState, now: number, effects: Effect[]): void {
  if (activePlayers(state).length < state.config.minPlayers) {
    // So many players left during the spawn phase that a game is no longer possible.
    endGame(state, null, 'abort', effects);
    return;
  }
  assignRoles(state, now);
  state.phase = 'reveal';
  delete state.spawnEndsAt;
  effects.push({ kind: 'event', to: 'all', event: { type: 'game.rolesRevealed' } });
}

/** reveal → playing: the match clock starts. */
function beginPlay(state: RoomState, now: number, effects: Effect[]): void {
  if (!state.game) return;
  state.phase = 'playing';
  startClock(state.game.clock, now);
  assignInitialTasks(state, now);
  effects.push({ kind: 'event', to: 'all', event: { type: 'game.playStarted' } });
}

export function advance(state: RoomState, now: number, effects: Effect[]): void {
  if (state.phase === 'spawning') {
    updateSpawnReach(state, now);
    if (spawnPhaseDone(state, now)) beginReveal(state, now, effects);
  }
  if (state.phase === 'reveal' && state.game && now >= state.game.revealEndsAt) {
    beginPlay(state, now, effects);
  }
  if (state.phase === 'playing') {
    updateZone(state, now, effects);
    updateTasks(state, now, effects);
  }
  checkVictory(state, now, effects);
}

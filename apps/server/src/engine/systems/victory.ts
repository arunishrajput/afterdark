/**
 * Win checks (RULES §12), called after every reducer run and every tick. The
 * first condition met ends the game, in strict order V1 → V6. Pure.
 *
 * Done here: V1 (team score), V3 (infection), V4 (time-up) and V5 (forfeit). V6 (abort)
 * is a host command, see `control.ts`. V2 (ejection) arrives with Phase 8.
 */
import { winnerOnTimeUp } from '@afterdark/shared';

import { gameNow } from '../clock';
import type { PlayerState, RoomState } from '../state';
import type { Effect } from '../types';
import { endGame } from './end';

const MS_PER_S = 1000;

/** Crew members counted toward the imposter win: infected, or (Phase 8) wrongly ejected. Exposed does not count (E9). */
export function compromisedCount(state: RoomState): number {
  return state.players.filter((p) => p.role === 'crew' && p.infection === 'infected').length;
}

/** Fully disconnected for `forfeitAfterS`, counted from the roles being assigned (RULES §10.6). */
function gone(state: RoomState, p: PlayerState, now: number, since: number): boolean {
  if (p.connected || p.disconnectedAt === undefined) return false;
  return now - Math.max(p.disconnectedAt, since) >= state.config.forfeitAfterS * MS_PER_S;
}

function sideGone(state: RoomState, side: PlayerState[], now: number, since: number): boolean {
  return side.length > 0 && side.every((p) => gone(state, p, now, since));
}

export function checkVictory(state: RoomState, now: number, effects: Effect[]): void {
  const game = state.game;
  if ((state.phase !== 'reveal' && state.phase !== 'playing') || !game) return;

  // V1 team score ≥ targetScore → crew (checked first, RULES §12).
  if (state.phase === 'playing' && game.teamScore >= state.config.targetScore) {
    endGame(state, 'crew', 'score', effects);
    return;
  }
  // V2 every imposter ejected → crew              TODO(phase 08): ejection
  // V3 compromised ≥ threshold → imposters (wrong ejection joins the count in Phase 8)
  if (state.phase === 'playing' && compromisedCount(state) >= game.threshold) {
    endGame(state, 'imposters', 'infection', effects);
    return;
  }

  // V4 the match clock reaches playTimeMin.
  if (state.phase === 'playing' && gameNow(game.clock, now) >= game.matchEndsAtGameMs) {
    const winner = winnerOnTimeUp({
      teamScore: game.teamScore,
      targetScore: state.config.targetScore,
      compromised: compromisedCount(state),
      threshold: game.threshold,
    });
    endGame(state, winner, 'time', effects);
    return;
  }

  // V5 forfeit: a whole side has been gone for forfeitAfterS; the other side wins.
  // A player who left is a permanent disconnect, so they stay on their side.
  const imposters = state.players.filter((p) => p.role === 'imposter');
  const crew = state.players.filter((p) => p.role === 'crew');
  const since = game.rolesAssignedAt;
  const impGone = sideGone(state, imposters, now, since);
  const crewGone = sideGone(state, crew, now, since);
  if (impGone && crewGone) endGame(state, 'draw', 'forfeit', effects);
  else if (impGone) endGame(state, 'crew', 'forfeit', effects);
  else if (crewGone) endGame(state, 'imposters', 'forfeit', effects);
}

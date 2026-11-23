/**
 * Win checks (RULES §12), called after every reducer run and every tick. The
 * first condition met ends the game, in strict order V1 → V6. Pure.
 *
 * Done here: V4 (time-up) and V5 (forfeit). V6 (abort) is a host command, see
 * `control.ts`. V1–V3 are stubbed below and arrive with the phases that can
 * trigger them.
 */
import { winnerOnTimeUp } from '@afterdark/shared';

import { gameNow } from '../clock';
import type { PlayerState, RoomState } from '../state';
import type { Effect } from '../types';
import { endGame } from './end';
import { activePlayers } from './players';

const MS_PER_S = 1000;

/** Crew members counted toward the imposter win: infected (Phase 7) or wrongly ejected (Phase 8). */
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

  // V1 team score ≥ targetScore → crew            TODO(phase 05): tasks add team score
  // V2 every imposter ejected → crew              TODO(phase 08): ejection
  // V3 compromised ≥ threshold → imposters        TODO(phase 07): infection, and 08: wrong ejection

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
  const active = activePlayers(state);
  const imposters = active.filter((p) => p.role === 'imposter');
  const crew = active.filter((p) => p.role === 'crew');
  const since = game.rolesAssignedAt;
  const impGone = sideGone(state, imposters, now, since);
  const crewGone = sideGone(state, crew, now, since);
  if (impGone && crewGone) endGame(state, 'draw', 'forfeit', effects);
  else if (impGone) endGame(state, 'crew', 'forfeit', effects);
  else if (crewGone) endGame(state, 'imposters', 'forfeit', effects);
}

/**
 * Win checks (RULES §12), called after every reducer run and every tick. The
 * first condition met ends the game, in strict order V1 → V6. Pure.
 *
 * Done here: V1 (team score), V3 (infection), V4 (time-up) and V5 (forfeit). V6 (abort)
 * is a host command, see `control.ts`. V2 (every imposter ejected) is live too (Phase 8). While a meeting runs, V2 and V3
 * wait for it to end, so the ejection reveal is shown first (ADR-072).
 */
import { winnerOnTimeUp } from '@afterdark/shared';

import { gameNow } from '../clock';
import type { PlayerState, RoomState } from '../state';
import type { Effect } from '../types';
import { endGame } from './end';

const MS_PER_S = 1000;

/** Crew members counted toward the imposter win: infected, or wrongly ejected (once each: an infected member who is ejected is not counted twice, E26). Exposed does not count (E9). */
export function compromisedCount(state: RoomState): number {
  return state.players.filter(
    (p) => p.role === 'crew' && (p.infection === 'infected' || p.wronglyEjected === true),
  ).length;
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
  const meetingOpen = game.meeting !== undefined;
  // V2 every imposter ejected → crew.
  const imposters = state.players.filter((p) => p.role === 'imposter');
  if (
    state.phase === 'playing' &&
    !meetingOpen &&
    imposters.length > 0 &&
    imposters.every((p) => p.spectator)
  ) {
    endGame(state, 'crew', 'ejection', effects);
    return;
  }
  // V3 compromised (infected or wrongly ejected) ≥ threshold → imposters.
  if (state.phase === 'playing' && !meetingOpen && compromisedCount(state) >= game.threshold) {
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

  // V5 forfeit: a whole side has been gone for forfeitAfterS; the other side wins. Suspended during a meeting (MEETINGS §6).
  // A player who left is a permanent disconnect, so they stay on their side; an ejected player is no longer on one.
  if (meetingOpen) return;
  const activeImposters = imposters.filter((p) => !p.spectator);
  const crew = state.players.filter((p) => p.role === 'crew' && !p.spectator);
  const since = game.rolesAssignedAt;
  const impGone = sideGone(state, activeImposters, now, since);
  const crewGone = sideGone(state, crew, now, since);
  if (impGone && crewGone) endGame(state, 'draw', 'forfeit', effects);
  else if (impGone) endGame(state, 'crew', 'forfeit', effects);
  else if (crewGone) endGame(state, 'imposters', 'forfeit', effects);
}

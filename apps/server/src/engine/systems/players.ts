/** Small helpers shared by the engine systems. */
import type { PlayerState, RoomState } from '../state';
import { RuleError } from '../types';

export function findPlayer(state: RoomState, playerId: string): PlayerState {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) throw new RuleError('NOT_FOUND', 'Player not in this lobby');
  return p;
}

/** Players still in the game: not left. (Spectators join this filter in Phase 8.) */
export const activePlayers = (state: RoomState): PlayerState[] =>
  state.players.filter((p) => !p.left);

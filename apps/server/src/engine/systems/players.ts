/** Small helpers shared by the engine systems. */
import type { PlayerState, RoomState } from '../state';
import { RuleError } from '../types';

export function findPlayer(state: RoomState, playerId: string): PlayerState {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) throw new RuleError('NOT_FOUND', 'Player not in this lobby');
  return p;
}

/** In the game and able to act: not left and not ejected. */
export const isActive = (p: PlayerState): boolean => !p.left && !p.spectator;

/** Players still in the game: not left and not ejected (spectators, MEETINGS §5). */
export const activePlayers = (state: RoomState): PlayerState[] => state.players.filter(isActive);

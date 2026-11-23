/** `tick(state, now)`: runs every `tickIntervalMs` on the Room's queue. Pure. */
import type { RoomState } from './state';
import { advance } from './systems/game';
import { tickLobby } from './systems/lobby';
import { refreshRegionCounts } from './systems/regionCounts';
import type { Effect, TickResult } from './types';

export function tick(state: RoomState, now: number): TickResult {
  const draft = structuredClone(state);
  const effects: Effect[] = [];
  tickLobby(draft, now, effects);
  advance(draft, now, effects);
  refreshRegionCounts(draft, now);
  return { state: draft, effects };
}

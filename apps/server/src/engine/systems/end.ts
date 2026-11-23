/** Ending a game (RULES §12): one place that sets the result, so every route out looks the same. */
import type { EndReason, Winner } from '@afterdark/shared';

import type { RoomState } from '../state';
import type { Effect } from '../types';
import { logEvent } from './log';

export function endGame(
  state: RoomState,
  winner: Winner,
  reason: EndReason,
  now: number,
  effects: Effect[],
): void {
  if (state.phase === 'ended') return;
  state.phase = 'ended';
  state.result = { winner, reason };
  delete state.spawnEndsAt;
  logEvent(state, now, 'end', [], { winner, reason });
  effects.push({ kind: 'event', to: 'all', event: { type: 'game.ended', winner, reason } });
}

/** `reduce(state, cmd, now)`: the single entry point for player commands. Pure. */
import type { RoomState } from './state';
import * as lobby from './systems/lobby';
import { type Command, type Effect, type ReduceResult, RuleError } from './types';

export type { ReduceResult } from './types';

export function reduce(state: RoomState, cmd: Command, now: number): ReduceResult {
  const draft = structuredClone(state);
  const effects: Effect[] = [];
  try {
    switch (cmd.type) {
      case 'join':
        lobby.join(draft, cmd.playerId, cmd.username);
        break;
      case 'leave':
        lobby.leave(draft, cmd.playerId, now, effects);
        break;
      case 'setReady':
        lobby.setReady(draft, cmd.playerId, cmd.ready);
        break;
      case 'updateConfig':
        lobby.updateConfig(draft, cmd.playerId, cmd.patch, effects);
        break;
      case 'kick':
        lobby.kick(draft, cmd.playerId, cmd.targetId, now, effects);
        break;
      case 'connect':
        lobby.connect(draft, cmd.playerId);
        break;
      case 'disconnect':
        lobby.disconnect(draft, cmd.playerId, now);
        break;
    }
  } catch (err) {
    if (err instanceof RuleError) return { ok: false, code: err.code, message: err.message };
    throw err;
  }
  lobby.evaluateCountdown(draft, now, effects);
  return { ok: true, state: draft, effects };
}

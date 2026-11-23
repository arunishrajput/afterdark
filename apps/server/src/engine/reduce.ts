/** `reduce(state, cmd, now)`: the single entry point for player commands. Pure. */
import type { RoomState } from './state';
import * as control from './systems/control';
import { advance } from './systems/game';
import * as lobby from './systems/lobby';
import * as location from './systems/location';
import * as map from './systems/map';
import * as setup from './systems/setup';
import * as play from './systems/taskPlay';
import { type Command, type Effect, type ReduceResult, RuleError } from './types';

export type { ReduceResult } from './types';

/** While the host has paused the game only these work (RULES §11): location, connection, leaving, and the host's own controls. */
const ALLOWED_WHILE_PAUSED: ReadonlySet<Command['type']> = new Set([
  'locUpdate',
  'teleport',
  'connect',
  'disconnect',
  'leave',
  'pause',
  'resume',
  'abort',
]);

export function reduce(state: RoomState, cmd: Command, now: number): ReduceResult {
  if (state.game?.clock.reasons.includes('host') && !ALLOWED_WHILE_PAUSED.has(cmd.type)) {
    return { ok: false, code: 'PAUSED', message: 'The host has paused the game' };
  }
  const draft = structuredClone(state);
  const effects: Effect[] = [];
  try {
    switch (cmd.type) {
      case 'join':
        lobby.join(draft, cmd.playerId, cmd.username, cmd.bot);
        break;
      case 'leave':
        lobby.leave(draft, cmd.playerId, now, effects);
        break;
      case 'setReady':
        lobby.setReady(draft, cmd.playerId, cmd.ready, now);
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
        play.resetOnDisconnect(draft, cmd.playerId, effects);
        break;
      case 'locUpdate':
        location.locUpdate(draft, cmd.playerId, cmd.fix, now);
        break;
      case 'setBoundary':
        map.setBoundary(draft, cmd.playerId, cmd.boundary, effects);
        break;
      case 'teleport':
        location.teleport(draft, cmd.playerId, cmd.lat, cmd.lng, now);
        break;
      case 'regenerateRegions':
        setup.regenerateRegions(draft, cmd.playerId, cmd.input, effects);
        break;
      case 'renameRegion':
        setup.renameRegion(draft, cmd.playerId, cmd.regionId, cmd.name, effects);
        break;
      case 'editTaskPoints':
        setup.editTaskPoints(draft, cmd.playerId, cmd.input, effects);
        break;
      case 'setNoGoZones':
        setup.setNoGoZones(draft, cmd.playerId, cmd.zones, effects);
        break;
      case 'setBase':
        setup.setBase(draft, cmd.playerId, cmd.base, effects);
        break;
      case 'forceStart':
        control.forceStart(draft, cmd.playerId, now, effects);
        break;
      case 'pause':
        control.pause(draft, cmd.playerId, now, effects);
        break;
      case 'resume':
        control.resume(draft, cmd.playerId, now, effects);
        break;
      case 'abort':
        control.abort(draft, cmd.playerId, effects);
        break;
      case 'taskOpen':
        play.openTask(draft, cmd.playerId, cmd.taskId, now, effects);
        break;
      case 'taskAction':
        play.actOnTask(draft, cmd.playerId, cmd.taskId, cmd.action, effects);
        break;
      case 'taskSubmit':
        play.submitTask(draft, cmd.playerId, cmd.taskId, cmd.answer, now, effects);
        break;
      case 'taskCancel':
        play.cancelTask(draft, cmd.playerId, cmd.taskId);
        break;
      case 'taskReroll':
        play.rerollTask(draft, cmd.playerId, cmd.taskId, now);
        break;
      case 'taskReportUnsafe':
        play.reportUnsafe(draft, cmd.playerId, cmd.taskId, now, effects);
        break;
      case 'devSetMinigames':
        control.setMinigames(draft, cmd.playerId, cmd.types);
        break;
      case 'devAutoComplete':
        play.autoCompleteTask(draft, cmd.playerId, cmd.taskId, now, effects);
        break;
    }
  } catch (err) {
    if (err instanceof RuleError) return { ok: false, code: err.code, message: err.message };
    throw err;
  }
  advance(draft, now, effects);
  lobby.evaluateCountdown(draft, now, effects);
  return { ok: true, state: draft, effects };
}

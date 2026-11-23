/** Engine commands, effects and results. */
import type {
  BoundaryInput,
  ErrorCode,
  GameConfigEditablePatch,
  GameEvent,
  LatLng,
  LobbyEditTaskPointsPayload,
  LobbyRegenerateRegionsPayload,
  LocUpdatePayload,
  Position,
} from '@afterdark/shared';

import type { RoomState } from './state';

/** A validated intent from one player (`playerId` is the actor). */
export type Command =
  | { type: 'join'; playerId: string; username: string; bot?: true }
  | { type: 'leave'; playerId: string }
  | { type: 'setReady'; playerId: string; ready: boolean }
  | { type: 'updateConfig'; playerId: string; patch: GameConfigEditablePatch }
  | { type: 'kick'; playerId: string; targetId: string }
  | { type: 'connect'; playerId: string }
  | { type: 'disconnect'; playerId: string }
  | { type: 'locUpdate'; playerId: string; fix: LocUpdatePayload }
  | { type: 'setBoundary'; playerId: string; boundary: BoundaryInput }
  | { type: 'teleport'; playerId: string; lat: number; lng: number }
  | { type: 'regenerateRegions'; playerId: string; input: LobbyRegenerateRegionsPayload }
  | { type: 'renameRegion'; playerId: string; regionId: string; name: string }
  | { type: 'editTaskPoints'; playerId: string; input: LobbyEditTaskPointsPayload }
  | { type: 'setNoGoZones'; playerId: string; zones: Position[][] }
  | { type: 'setBase'; playerId: string; base: LatLng }
  | { type: 'forceStart'; playerId: string }
  | { type: 'pause'; playerId: string }
  | { type: 'resume'; playerId: string }
  | { type: 'abort'; playerId: string };

/** Something the Room must do outside the state: send an event, close a session. */
export type Effect =
  | { kind: 'event'; to: 'all' | readonly string[]; event: GameEvent }
  | { kind: 'removed'; playerId: string; reason: 'left' | 'kicked' };

export type ReduceResult =
  | { ok: true; state: RoomState; effects: Effect[] }
  | { ok: false; code: ErrorCode; message: string };

export interface TickResult {
  state: RoomState;
  effects: Effect[];
}

/** Thrown inside a system to reject a command; `reduce` turns it into a result. */
export class RuleError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Engine commands, effects and results. */
import type {
  BoundaryInput,
  CamouflageAck,
  CoopJoinAck,
  CoopSubmitAck,
  ErrorCode,
  FakeTaskAck,
  GameConfigEditablePatch,
  GameEvent,
  InfectAck,
  LatLng,
  LobbyEditTaskPointsPayload,
  LobbyRegenerateRegionsPayload,
  LocUpdatePayload,
  Position,
  SoloMinigameType,
  TaskActionAck,
  TaskOpenAck,
  TaskStopAck,
  TaskSubmitAck,
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
  | { type: 'abort'; playerId: string }
  /** Host, ended: back to the lobby with the same setup. `salt` re-seeds the secrets (drawn by the socket layer). */
  | { type: 'playAgain'; playerId: string; salt: string }
  | { type: 'taskOpen'; playerId: string; taskId: string }
  | { type: 'taskAction'; playerId: string; taskId: string; action: unknown }
  | { type: 'taskSubmit'; playerId: string; taskId: string; answer: unknown }
  | { type: 'taskCancel'; playerId: string; taskId: string }
  | { type: 'taskReroll'; playerId: string; taskId: string }
  | { type: 'taskReportUnsafe'; playerId: string; taskId: string }
  | { type: 'infectStart'; playerId: string }
  | { type: 'infectCancel'; playerId: string }
  | { type: 'abilityTaskStop'; playerId: string }
  | { type: 'abilityFakeTask'; playerId: string; at: LatLng }
  | { type: 'abilityCamouflage'; playerId: string }
  | { type: 'coopStart'; playerId: string; taskId: string }
  | { type: 'coopJoin'; playerId: string; taskId: string }
  | { type: 'coopSubmit'; playerId: string; taskId: string; answer: unknown }
  | { type: 'coopCancel'; playerId: string; taskId: string }
  | { type: 'meetingCall'; playerId: string }
  | { type: 'meetingSkipDiscussion'; playerId: string }
  | { type: 'meetingVote'; playerId: string; target: string }
  /** Test mode only (`dev:autoComplete`): finish an open task as if solved. */
  | { type: 'devAutoComplete'; playerId: string; taskId: string }
  /** Test mode only (`dev:forceCoop`): make a co-op task between two chosen players. */
  | { type: 'devForceCoop'; playerId: string; ownerId: string; partnerId: string }
  /** Test mode only (`dev:advanceClock`): jump game time forward. */
  | { type: 'devAdvanceClock'; playerId: string; seconds: number }
  /** Test mode only (`dev:setMinigames`): restrict the types new tasks can be. */
  | { type: 'devSetMinigames'; playerId: string; types: SoloMinigameType[] };

/** What a task command answers its caller with (the ack's data). It goes to nobody else. */
export type CommandReply =
  | { type: 'open'; ack: TaskOpenAck }
  | { type: 'action'; ack: TaskActionAck }
  | { type: 'submit'; ack: TaskSubmitAck }
  | { type: 'infect'; ack: InfectAck }
  | { type: 'taskStop'; ack: TaskStopAck }
  | { type: 'fakeTask'; ack: FakeTaskAck }
  | { type: 'camouflage'; ack: CamouflageAck }
  | { type: 'coopJoin'; ack: CoopJoinAck }
  | { type: 'coopSubmit'; ack: CoopSubmitAck };

/** Something the Room must do outside the state: send an event, close a session. */
export type Effect =
  | { kind: 'event'; to: 'all' | readonly string[]; event: GameEvent }
  | { kind: 'removed'; playerId: string; reason: 'left' | 'kicked' }
  /** The answer to the command's own caller. The socket layer returns it in the ack and sends it nowhere else. */
  | { kind: 'reply'; playerId: string; reply: CommandReply }
  /** Something to log without player data (Invariant 8): a point id, never a position or a name. */
  | { kind: 'audit'; what: 'unsafePoint'; pointId: string };

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

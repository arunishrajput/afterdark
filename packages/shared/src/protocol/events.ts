/** Event names and typed Socket.IO maps (mirrors docs/PROTOCOL.md). */
import type { KickReason } from '../types/domain';
import type {
  CamouflageAck,
  CoopJoinAck,
  CoopSubmitAck,
  FakeTaskAck,
  GameEvent,
  InfectAck,
  PlayerView,
  RadarPayload,
  TaskActionAck,
  TaskOpenAck,
  TaskStopAck,
  TaskSubmitAck,
} from '../types/view';
import type {
  DevAddBotsPayload,
  DevAdvanceClockPayload,
  DevSetMinigamesPayload,
  DevTeleportPayload,
  ErrorCode,
  FakeTaskPayload,
  GameCommandPayload,
  LobbyCreatePayload,
  LobbyEditTaskPointsPayload,
  LobbyJoinPayload,
  LobbyKickPayload,
  LobbyLeavePayload,
  LobbyRegenerateRegionsPayload,
  LobbyRenameRegionPayload,
  LobbySetBasePayload,
  LobbySetBoundaryPayload,
  LobbySetNoGoZonesPayload,
  LobbySetReadyPayload,
  LobbyUpdateConfigPayload,
  LocUpdatePayload,
  MeetingCommandPayload,
  MeetingVotePayload,
  SessionResumePayload,
  TaskActionPayload,
  TaskRefPayload,
  TaskReportUnsafePayload,
  TaskSubmitPayload,
  TimePingPayload,
} from './schemas';

/** Every client → server event is acknowledged with this shape. */
export type Ack<T = void> =
  { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } };

export type AckCallback<T = void> = (res: Ack<T>) => void;

export interface TimePingAck {
  serverTs: number;
}

export interface SessionResumeAck {
  playerId: string;
  code: string;
}

export interface LobbyCreateAck {
  code: string;
  token: string;
  playerId: string;
}

export interface LobbyJoinAck {
  token: string;
  playerId: string;
}

export interface LobbySetBoundaryAck {
  areaM2: number;
}

export interface ClientToServerEvents {
  'time:ping': (payload: TimePingPayload, ack: AckCallback<TimePingAck>) => void;
  'session:resume': (payload: SessionResumePayload, ack: AckCallback<SessionResumeAck>) => void;
  'lobby:create': (payload: LobbyCreatePayload, ack: AckCallback<LobbyCreateAck>) => void;
  'lobby:join': (payload: LobbyJoinPayload, ack: AckCallback<LobbyJoinAck>) => void;
  'lobby:leave': (payload: LobbyLeavePayload, ack: AckCallback) => void;
  'lobby:setReady': (payload: LobbySetReadyPayload, ack: AckCallback) => void;
  'lobby:updateConfig': (payload: LobbyUpdateConfigPayload, ack: AckCallback) => void;
  'lobby:kick': (payload: LobbyKickPayload, ack: AckCallback) => void;
  /** Volatile and fire-and-forget: the client sends it without an ack callback. */
  'loc:update': (payload: LocUpdatePayload) => void;
  'lobby:setBoundary': (
    payload: LobbySetBoundaryPayload,
    ack: AckCallback<LobbySetBoundaryAck>,
  ) => void;
  'lobby:regenerateRegions': (payload: LobbyRegenerateRegionsPayload, ack: AckCallback) => void;
  'lobby:renameRegion': (payload: LobbyRenameRegionPayload, ack: AckCallback) => void;
  'lobby:editTaskPoints': (payload: LobbyEditTaskPointsPayload, ack: AckCallback) => void;
  'lobby:setNoGoZones': (payload: LobbySetNoGoZonesPayload, ack: AckCallback) => void;
  'lobby:setBase': (payload: LobbySetBasePayload, ack: AckCallback) => void;
  'game:forceStart': (payload: GameCommandPayload, ack: AckCallback) => void;
  'game:pause': (payload: GameCommandPayload, ack: AckCallback) => void;
  'game:resume': (payload: GameCommandPayload, ack: AckCallback) => void;
  'game:abort': (payload: GameCommandPayload, ack: AckCallback) => void;
  'task:open': (payload: TaskRefPayload, ack: AckCallback<TaskOpenAck>) => void;
  'task:action': (payload: TaskActionPayload, ack: AckCallback<TaskActionAck>) => void;
  'task:submit': (payload: TaskSubmitPayload, ack: AckCallback<TaskSubmitAck>) => void;
  'task:cancel': (payload: TaskRefPayload, ack: AckCallback) => void;
  'task:reroll': (payload: TaskRefPayload, ack: AckCallback) => void;
  'task:reportUnsafe': (payload: TaskReportUnsafePayload, ack: AckCallback) => void;
  'ability:infect': (payload: GameCommandPayload, ack: AckCallback<InfectAck>) => void;
  'ability:cancelInfect': (payload: GameCommandPayload, ack: AckCallback) => void;
  'ability:taskStop': (payload: GameCommandPayload, ack: AckCallback<TaskStopAck>) => void;
  'ability:fakeTask': (payload: FakeTaskPayload, ack: AckCallback<FakeTaskAck>) => void;
  'ability:camouflage': (payload: GameCommandPayload, ack: AckCallback<CamouflageAck>) => void;
  'coop:start': (payload: TaskRefPayload, ack: AckCallback) => void;
  'coop:join': (payload: TaskRefPayload, ack: AckCallback<CoopJoinAck>) => void;
  'coop:submit': (payload: TaskSubmitPayload, ack: AckCallback<CoopSubmitAck>) => void;
  'coop:cancel': (payload: TaskRefPayload, ack: AckCallback) => void;
  'meeting:call': (payload: MeetingCommandPayload, ack: AckCallback) => void;
  'meeting:skipDiscussion': (payload: MeetingCommandPayload, ack: AckCallback) => void;
  'meeting:vote': (payload: MeetingVotePayload, ack: AckCallback) => void;
  'dev:teleport': (payload: DevTeleportPayload, ack: AckCallback) => void;
  'dev:addBots': (payload: DevAddBotsPayload, ack: AckCallback) => void;
  'dev:advanceClock': (payload: DevAdvanceClockPayload, ack: AckCallback) => void;
  'dev:autoComplete': (payload: TaskRefPayload, ack: AckCallback) => void;
  'dev:setMinigames': (payload: DevSetMinigamesPayload, ack: AckCallback) => void;
}

export interface KickedPayload {
  reason: KickReason;
}

/** Sent to every client just before a deploy or restart; the socket then reconnects by itself. */
export interface ServerShutdownPayload {
  reason: 'restart';
}

export interface ServerToClientEvents {
  view: (view: PlayerView) => void;
  radar: (payload: RadarPayload) => void;
  event: (event: GameEvent) => void;
  kicked: (payload: KickedPayload) => void;
  'server:shutdown': (payload: ServerShutdownPayload) => void;
}

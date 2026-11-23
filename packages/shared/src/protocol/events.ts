/** Event names and typed Socket.IO maps (mirrors docs/PROTOCOL.md). */
import type { KickReason } from '../types/domain';
import type { GameEvent, PlayerView } from '../types/view';
import type {
  ErrorCode,
  LobbyCreatePayload,
  LobbyJoinPayload,
  LobbyKickPayload,
  LobbyLeavePayload,
  LobbySetReadyPayload,
  LobbyUpdateConfigPayload,
  SessionResumePayload,
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

export interface ClientToServerEvents {
  'time:ping': (payload: TimePingPayload, ack: AckCallback<TimePingAck>) => void;
  'session:resume': (payload: SessionResumePayload, ack: AckCallback<SessionResumeAck>) => void;
  'lobby:create': (payload: LobbyCreatePayload, ack: AckCallback<LobbyCreateAck>) => void;
  'lobby:join': (payload: LobbyJoinPayload, ack: AckCallback<LobbyJoinAck>) => void;
  'lobby:leave': (payload: LobbyLeavePayload, ack: AckCallback) => void;
  'lobby:setReady': (payload: LobbySetReadyPayload, ack: AckCallback) => void;
  'lobby:updateConfig': (payload: LobbyUpdateConfigPayload, ack: AckCallback) => void;
  'lobby:kick': (payload: LobbyKickPayload, ack: AckCallback) => void;
}

export interface KickedPayload {
  reason: KickReason;
}

export interface ServerToClientEvents {
  view: (view: PlayerView) => void;
  event: (event: GameEvent) => void;
  kicked: (payload: KickedPayload) => void;
}

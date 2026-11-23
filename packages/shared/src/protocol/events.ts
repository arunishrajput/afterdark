/** Event names and typed Socket.IO maps (mirrors docs/PROTOCOL.md). */
import type { ErrorCode, TimePingPayload } from './schemas';

/** Every client → server event is acknowledged with this shape. */
export type Ack<T = void> =
  { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } };

export type AckCallback<T = void> = (res: Ack<T>) => void;

export interface TimePingAck {
  serverTs: number;
}

export interface ClientToServerEvents {
  'time:ping': (payload: TimePingPayload, ack: AckCallback<TimePingAck>) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- server events arrive in Phase 1
export interface ServerToClientEvents {}

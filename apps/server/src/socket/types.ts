import type { ClientToServerEvents, ServerToClientEvents } from '@afterdark/shared';
import type { Server, Socket } from 'socket.io';

/** Per-socket binding, set once the socket creates, joins or resumes a lobby. */
export interface SocketData {
  playerId?: string;
  code?: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- single process, no adapter events
type InterServerEvents = {};

export type GameIo = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
export type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

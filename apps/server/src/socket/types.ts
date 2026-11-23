import type { ClientToServerEvents, ServerToClientEvents } from '@afterdark/shared';
import type { Server } from 'socket.io';

export type GameIo = Server<ClientToServerEvents, ServerToClientEvents>;

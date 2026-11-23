/**
 * Socket.IO gateway: rate limit → zod validation (in `validated()`) → command
 * → Room. Owns the RoomManager and session registry for this server.
 */
import { DEFAULT_CONFIG, type ErrorCode, timePingSchema } from '@afterdark/shared';

import type { Logger } from '../logger';
import type { CodeSource } from '../rooms/lobbyCode';
import { RoomManager } from '../rooms/RoomManager';
import { SessionRegistry } from '../rooms/sessions';
import type { ViewEmitter } from '../rooms/ViewEmitter';
import type { GatewayContext } from './context';
import { validated } from './handler';
import { registerLobbyHandlers } from './handlers/lobby';
import { registerSessionHandlers } from './handlers/session';
import { createRateLimiter } from './rateLimit';
import type { GameIo } from './types';
import { attachRoom } from './wiring';

export interface GatewayDeps {
  logger: Logger;
  now: () => number;
  allowTestMode: boolean;
  codeSource?: CodeSource;
}

export interface Gateway {
  rooms: RoomManager;
  sessions: SessionRegistry;
  close(): void;
}

const RATE_LIMITED: { code: ErrorCode; message: string } = {
  code: 'RATE_LIMITED',
  message: 'Too many requests',
};

export function createGateway(io: GameIo, deps: GatewayDeps): Gateway {
  const { logger, now } = deps;
  const sessions = new SessionRegistry();
  const emitters = new Map<string, ViewEmitter>();
  // The hooks run only once rooms exist, after `ctx` below is initialised.
  const rooms = new RoomManager({
    now,
    allowTestMode: deps.allowTestMode,
    ...(deps.codeSource ? { codeSource: deps.codeSource } : {}),
    onCreate: (room) => attachRoom(ctx, room, now),
    onDelete: (code) => {
      emitters.get(code)?.dispose();
      emitters.delete(code);
      sessions.purgeLobby(code);
      logger.info({ code }, 'lobby deleted');
    },
  });
  const ctx: GatewayContext = { io, logger, sessions, emitters, rooms };
  const stopSweeper = rooms.startSweeper();

  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'socket connected');

    const limiter = createRateLimiter(DEFAULT_CONFIG.socketEventsPerSecond);
    socket.use(([event, ...args], next) => {
      if (limiter.allow()) {
        next();
        return;
      }
      logger.warn({ socketId: socket.id, event }, 'rate limited');
      const ack: unknown = args.at(-1);
      if (typeof ack === 'function')
        (ack as (r: unknown) => void)({ ok: false, error: RATE_LIMITED });
    });

    socket.on(
      'time:ping',
      validated('time:ping', timePingSchema, logger, () => ({ serverTs: now() })),
    );
    registerSessionHandlers(ctx, socket);
    registerLobbyHandlers(ctx, socket);

    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'socket disconnected');
      const { playerId, code } = socket.data;
      if (playerId === undefined || code === undefined) return;
      if (!sessions.unbind(playerId, socket.id)) return; // already replaced by a newer socket
      rooms.get(code)?.dispatch({ type: 'disconnect', playerId });
    });
  });

  return {
    rooms,
    sessions,
    close: () => {
      stopSweeper();
      rooms.closeAll();
    },
  };
}

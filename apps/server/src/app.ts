/** Builds the HTTP + Socket.IO server without listening (tests use port 0). */
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';

import express from 'express';
import { Server } from 'socket.io';

import type { Logger } from './logger';
import type { CodeSource } from './rooms/lobbyCode';
import type { RoomManager } from './rooms/RoomManager';
import { createGateway } from './socket/gateway';
import type { GameIo } from './socket/types';

/** Socket.IO payload cap (PROTOCOL.md › Conventions: 16 KB). */
const MAX_PAYLOAD_BYTES = 16 * 1024;

export interface ServerDeps {
  logger: Logger;
  now: () => number;
  version: { sha: string };
  /** `ALLOW_TEST_MODE`: may hosts enable per-lobby test mode? */
  allowTestMode: boolean;
  /** Tests inject a seeded source for reproducible lobby codes. */
  codeSource?: CodeSource;
  /** Secret salt per new room (tests and the e2e server pin it to make roles reproducible). */
  saltSource?: () => string;
}

export interface GameServer {
  httpServer: HttpServer;
  io: GameIo;
  rooms: RoomManager;
  close(): Promise<void>;
}

export function createServer(deps: ServerDeps): GameServer {
  const { logger, now, version } = deps;
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/version', (_req, res) => {
    res.json({ sha: version.sha });
  });

  const httpServer = createHttpServer(app);
  const io: GameIo = new Server(httpServer, { maxHttpBufferSize: MAX_PAYLOAD_BYTES });
  const gateway = createGateway(io, {
    logger,
    now,
    allowTestMode: deps.allowTestMode,
    ...(deps.codeSource ? { codeSource: deps.codeSource } : {}),
    ...(deps.saltSource ? { saltSource: deps.saltSource } : {}),
  });

  return {
    httpServer,
    io,
    rooms: gateway.rooms,
    close: () =>
      new Promise<void>((resolve, reject) => {
        gateway.close();
        // io.close() also closes the underlying HTTP server.
        void io.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

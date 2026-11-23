/** Builds the HTTP + Socket.IO server without listening (tests use port 0). */
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';

import express from 'express';
import { Server } from 'socket.io';

import type { Logger } from './logger';
import { registerGateway } from './socket/gateway';
import type { GameIo } from './socket/types';

/** Socket.IO payload cap (PROTOCOL.md › Conventions: 16 KB). */
const MAX_PAYLOAD_BYTES = 16 * 1024;

export interface ServerDeps {
  logger: Logger;
  now: () => number;
  version: { sha: string };
}

export interface GameServer {
  httpServer: HttpServer;
  io: GameIo;
  close(): Promise<void>;
}

export function createServer({ logger, now, version }: ServerDeps): GameServer {
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
  registerGateway(io, { logger, now });

  return {
    httpServer,
    io,
    close: () =>
      new Promise<void>((resolve, reject) => {
        // io.close() also closes the underlying HTTP server.
        void io.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

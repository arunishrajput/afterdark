/** Builds the HTTP + Socket.IO server without listening (tests use port 0). */
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

import { DEFAULT_CONFIG } from '@afterdark/shared';
import express from 'express';
import { Server } from 'socket.io';

import type { Logger } from './logger';
import type { CodeSource } from './rooms/lobbyCode';
import type { RoomManager } from './rooms/RoomManager';
import { createGateway } from './socket/gateway';
import type { LobbyLimits } from './socket/lobbyLimits';
import type { GameIo } from './socket/types';
import { applyHardening, isSameOrigin, mountClient } from './web';

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
  /** Built client to serve (production only); absent in dev and tests. */
  clientDir?: string;
  /** Secret salt per new room (tests and the e2e server pin it to make roles reproducible). */
  saltSource?: () => string;
  /** Lobby creation limits (default: CONFIG, loopback exempt; ADR-107). */
  lobbyLimits?: Partial<LobbyLimits>;
}

export interface GameServer {
  httpServer: HttpServer;
  io: GameIo;
  rooms: RoomManager;
  /** Stops everything now (tests, and the last step of `shutdown`). */
  close(): Promise<void>;
  /** Graceful stop for SIGTERM: tell every client, give them a moment, then close. */
  shutdown(): Promise<void>;
}

export function createServer(deps: ServerDeps): GameServer {
  const { logger, now, version } = deps;
  const app = express();
  app.disable('x-powered-by');
  // Render terminates TLS in front of us: trust one proxy hop so req.ip and req.protocol are right.
  app.set('trust proxy', 1);

  applyHardening(app);
  // HTTP request log: method, path without the query string (it can carry a lobby code), status, duration.
  app.use((req, res, next) => {
    const startedAt = performance.now();
    res.on('finish', () => {
      const fields = {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Math.round(performance.now() - startedAt),
      };
      // The platform polls /health every few seconds, so keep it out of the info log.
      if (req.path === '/health') logger.debug(fields, 'http request');
      else logger.info(fields, 'http request');
    });
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/version', (_req, res) => {
    res.json({ sha: version.sha });
  });

  if (deps.clientDir && !mountClient(app, deps.clientDir)) {
    logger.warn({ clientDir: deps.clientDir }, 'client build not found, serving the API only');
  }

  const httpServer = createHttpServer(app);
  // Same origin only. Without a CORS option polling is blocked cross-site, but WebSocket upgrades
  // ignore CORS, so check the Origin header ourselves (bots and tools send none).
  const io: GameIo = new Server(httpServer, {
    maxHttpBufferSize: MAX_PAYLOAD_BYTES,
    allowRequest: (req, callback) => {
      callback(null, isSameOrigin(req.headers.origin, req.headers.host));
    },
  });
  const gateway = createGateway(io, {
    logger,
    now,
    allowTestMode: deps.allowTestMode,
    ...(deps.codeSource ? { codeSource: deps.codeSource } : {}),
    ...(deps.saltSource ? { saltSource: deps.saltSource } : {}),
    ...(deps.lobbyLimits ? { lobbyLimits: deps.lobbyLimits } : {}),
  });

  // Idempotent: a second close (or shutdown then close) waits for the first.
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= new Promise<void>((resolve, reject) => {
      gateway.close();
      // io.close() also closes the underlying HTTP server.
      void io.close((err) => (err ? reject(err) : resolve()));
    }));

  return {
    httpServer,
    io,
    rooms: gateway.rooms,
    close,
    shutdown: async () => {
      io.emit('server:shutdown', { reason: 'restart' });
      await sleep(DEFAULT_CONFIG.shutdownNoticeMs);
      await close();
    },
  };
}

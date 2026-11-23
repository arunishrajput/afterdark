/** Process entry point: env → logger → server → listen, with graceful shutdown. */
import path from 'node:path';

import { createServer } from './app';
import { parseEnv } from './env';
import { createLogger } from './logger';
import { resolveSha } from './version';

// Next to dist/ (production) or src/ (tsx): apps/client/dist.
const CLIENT_DIST = path.resolve(import.meta.dirname, '../../client/dist');

const env = parseEnv(process.env);
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });
const server = createServer({
  logger,
  // Production serves the built client from this same process (one Render web service, ADR-025).
  ...(env.NODE_ENV === 'production' ? { clientDir: CLIENT_DIST } : {}),
  now: Date.now,
  version: { sha: resolveSha(process.env) },
  allowTestMode: env.ALLOW_TEST_MODE,
  ...(env.TEST_ROOM_SALT === undefined ? {} : { saltSource: () => env.TEST_ROOM_SALT as string }),
});

server.httpServer.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      allowTestMode: env.ALLOW_TEST_MODE,
      pinnedRoomSalt: env.TEST_ROOM_SALT !== undefined,
    },
    'AfterDark server listening',
  );
});

const shutdown = (signal: string) => {
  logger.info({ signal }, 'shutting down');
  server.shutdown().then(
    () => process.exit(0),
    (err: unknown) => {
      logger.error({ err }, 'shutdown failed');
      process.exit(1);
    },
  );
};
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

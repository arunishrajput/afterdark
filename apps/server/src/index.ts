/** Process entry point: env → logger → server → listen, with graceful shutdown. */
import { createServer } from './app';
import { parseEnv } from './env';
import { createLogger } from './logger';
import { resolveSha } from './version';

const env = parseEnv(process.env);
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });
const server = createServer({ logger, now: Date.now, version: { sha: resolveSha(process.env) } });

server.httpServer.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV, allowTestMode: env.ALLOW_TEST_MODE },
    'AfterDark server listening',
  );
});

const shutdown = (signal: string) => {
  logger.info({ signal }, 'shutting down');
  server.close().then(
    () => process.exit(0),
    (err: unknown) => {
      logger.error({ err }, 'shutdown failed');
      process.exit(1);
    },
  );
};
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

/** Registers every Socket.IO event handler. */
import { timePingSchema } from '@afterdark/shared';

import type { Logger } from '../logger';
import { validated } from './handler';
import type { GameIo } from './types';

export interface GatewayDeps {
  logger: Logger;
  now: () => number;
}

export function registerGateway(io: GameIo, { logger, now }: GatewayDeps): void {
  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'socket connected');

    socket.on(
      'time:ping',
      validated('time:ping', timePingSchema, logger, () => ({ serverTs: now() })),
    );

    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'socket disconnected');
    });
  });
}

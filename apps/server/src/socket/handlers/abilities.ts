/** Imposter abilities. Phase 7: Infect and cancelling it. The payloads carry nothing: the server picks the target. */
import { gameCommandSchema } from '@afterdark/shared';

import { type GatewayContext, requireBinding, run, runForReply } from '../context';
import { HandlerError, validated } from '../handler';
import type { GameSocket } from '../types';

export function registerAbilityHandlers(ctx: GatewayContext, socket: GameSocket): void {
  const { logger } = ctx;

  socket.on(
    'ability:infect',
    validated('ability:infect', gameCommandSchema, logger, () => {
      const { room, playerId } = requireBinding(ctx, socket);
      const reply = runForReply(room, { type: 'infectStart', playerId });
      if (reply.type !== 'infect') throw new HandlerError('INTERNAL', 'Unexpected reply');
      return reply.ack;
    }),
  );

  socket.on(
    'ability:cancelInfect',
    validated('ability:cancelInfect', gameCommandSchema, logger, () => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'infectCancel', playerId });
    }),
  );
}

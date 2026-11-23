/** Imposter abilities. Infect and cancelling it carry nothing (the server picks the target); Fake Task carries the pin. */
import { fakeTaskSchema, gameCommandSchema } from '@afterdark/shared';

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

  socket.on(
    'ability:taskStop',
    validated('ability:taskStop', gameCommandSchema, logger, () => {
      const { room, playerId } = requireBinding(ctx, socket);
      const reply = runForReply(room, { type: 'abilityTaskStop', playerId });
      if (reply.type !== 'taskStop') throw new HandlerError('INTERNAL', 'Unexpected reply');
      return reply.ack;
    }),
  );

  socket.on(
    'ability:fakeTask',
    validated('ability:fakeTask', fakeTaskSchema, logger, ({ lat, lng }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      const reply = runForReply(room, { type: 'abilityFakeTask', playerId, at: { lat, lng } });
      if (reply.type !== 'fakeTask') throw new HandlerError('INTERNAL', 'Unexpected reply');
      return reply.ack;
    }),
  );
}

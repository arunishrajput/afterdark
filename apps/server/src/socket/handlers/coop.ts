/** Co-op task actions (PROTOCOL Phase 10): start, join, submit and cancel. The PIN puzzle comes back in the join ack and in the player's own view. */
import { taskRefSchema, taskSubmitSchema } from '@afterdark/shared';

import { type GatewayContext, requireBinding, run, runForReply } from '../context';
import { HandlerError, validated } from '../handler';
import type { GameSocket } from '../types';

export function registerCoopHandlers(ctx: GatewayContext, socket: GameSocket): void {
  const { logger } = ctx;

  for (const [event, type] of [
    ['coop:start', 'coopStart'],
    ['coop:cancel', 'coopCancel'],
  ] as const) {
    socket.on(
      event,
      validated(event, taskRefSchema, logger, ({ taskId }) => {
        const { room, playerId } = requireBinding(ctx, socket);
        run(room, { type, playerId, taskId });
      }),
    );
  }

  socket.on(
    'coop:join',
    validated('coop:join', taskRefSchema, logger, ({ taskId }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      const reply = runForReply(room, { type: 'coopJoin', playerId, taskId });
      if (reply.type !== 'coopJoin') throw new HandlerError('INTERNAL', 'Unexpected reply');
      return reply.ack;
    }),
  );

  socket.on(
    'coop:submit',
    validated('coop:submit', taskSubmitSchema, logger, ({ taskId, answer }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      const reply = runForReply(room, { type: 'coopSubmit', playerId, taskId, answer });
      if (reply.type !== 'coopSubmit') throw new HandlerError('INTERNAL', 'Unexpected reply');
      return reply.ack;
    }),
  );
}

/** Task actions (PROTOCOL Phase 5): open, play, submit, cancel, reroll, report, and the test-mode shortcut. */
import {
  taskActionSchema,
  taskRefSchema,
  taskReportUnsafeSchema,
  taskSubmitSchema,
} from '@afterdark/shared';

import { type GatewayContext, requireBinding, run, runForReply } from '../context';
import { HandlerError, validated } from '../handler';
import type { GameSocket } from '../types';

export function registerTaskHandlers(ctx: GatewayContext, socket: GameSocket): void {
  const { logger } = ctx;

  socket.on(
    'task:open',
    validated('task:open', taskRefSchema, logger, ({ taskId }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      const reply = runForReply(room, { type: 'taskOpen', playerId, taskId });
      if (reply.type !== 'open') throw new HandlerError('INTERNAL', 'Unexpected reply');
      return reply.ack;
    }),
  );

  socket.on(
    'task:action',
    validated('task:action', taskActionSchema, logger, ({ taskId, action }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      const reply = runForReply(room, { type: 'taskAction', playerId, taskId, action });
      if (reply.type !== 'action') throw new HandlerError('INTERNAL', 'Unexpected reply');
      return reply.ack;
    }),
  );

  socket.on(
    'task:submit',
    validated('task:submit', taskSubmitSchema, logger, ({ taskId, answer }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      const reply = runForReply(room, { type: 'taskSubmit', playerId, taskId, answer });
      if (reply.type !== 'submit') throw new HandlerError('INTERNAL', 'Unexpected reply');
      return reply.ack;
    }),
  );

  for (const [event, type] of [
    ['task:cancel', 'taskCancel'],
    ['task:reroll', 'taskReroll'],
    ['dev:autoComplete', 'devAutoComplete'],
  ] as const) {
    socket.on(
      event,
      validated(event, taskRefSchema, logger, ({ taskId }) => {
        const { room, playerId } = requireBinding(ctx, socket);
        run(room, { type, playerId, taskId });
      }),
    );
  }

  // The optional reason is not stored or logged: only the point id is (the `audit` effect).
  socket.on(
    'task:reportUnsafe',
    validated('task:reportUnsafe', taskReportUnsafeSchema, logger, ({ taskId }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'taskReportUnsafe', playerId, taskId });
    }),
  );
}

/** Host controls during a game, and the test-mode bots (PROTOCOL Phase 4). */
import {
  devAddBotsSchema,
  devAdvanceClockSchema,
  devForceCoopSchema,
  devSetMinigamesSchema,
  gameCommandSchema,
} from '@afterdark/shared';

import { type GatewayContext, requireBinding, run } from '../context';
import { HandlerError, validated } from '../handler';
import type { GameSocket } from '../types';

export function registerGameHandlers(ctx: GatewayContext, socket: GameSocket): void {
  const { logger } = ctx;

  for (const [event, type] of [
    ['game:forceStart', 'forceStart'],
    ['game:pause', 'pause'],
    ['game:resume', 'resume'],
    ['game:abort', 'abort'],
  ] as const) {
    socket.on(
      event,
      validated(event, gameCommandSchema, logger, () => {
        const { room, playerId } = requireBinding(ctx, socket);
        run(room, { type, playerId });
      }),
    );
  }

  socket.on(
    'dev:addBots',
    validated('dev:addBots', devAddBotsSchema, logger, ({ count, imposterBehaviour, meetings }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      const { state } = room;
      if (!state.config.testMode) throw new HandlerError('NOT_ALLOWED', 'Test mode is off');
      if (state.hostId !== playerId)
        throw new HandlerError('NOT_HOST', 'Only the host can add bots');
      if (state.phase !== 'lobby') throw new HandlerError('WRONG_PHASE', 'Bots join in the lobby');
      if (state.players.length + count > state.config.maxPlayers) {
        throw new HandlerError('LOBBY_FULL', 'That would overfill the lobby');
      }
      ctx.bots.get(room.code)?.add(count, imposterBehaviour, meetings);
    }),
  );

  socket.on(
    'dev:advanceClock',
    validated('dev:advanceClock', devAdvanceClockSchema, logger, ({ seconds }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'devAdvanceClock', playerId, seconds });
    }),
  );

  socket.on(
    'dev:forceCoop',
    validated('dev:forceCoop', devForceCoopSchema, logger, ({ ownerId, partnerId }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'devForceCoop', playerId, ownerId, partnerId });
    }),
  );

  socket.on(
    'dev:setMinigames',
    validated('dev:setMinigames', devSetMinigamesSchema, logger, ({ types }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'devSetMinigames', playerId, types });
    }),
  );
}

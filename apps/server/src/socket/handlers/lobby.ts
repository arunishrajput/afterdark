/** In-lobby actions: ready, settings, kick (PROTOCOL Phase 1). */
import { lobbyKickSchema, lobbySetReadySchema, lobbyUpdateConfigSchema } from '@afterdark/shared';

import { type GatewayContext, requireBinding, run } from '../context';
import { validated } from '../handler';
import type { GameSocket } from '../types';

export function registerLobbyHandlers(ctx: GatewayContext, socket: GameSocket): void {
  const { logger } = ctx;

  socket.on(
    'lobby:setReady',
    validated('lobby:setReady', lobbySetReadySchema, logger, ({ ready }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'setReady', playerId, ready });
    }),
  );

  socket.on(
    'lobby:updateConfig',
    validated('lobby:updateConfig', lobbyUpdateConfigSchema, logger, ({ patch }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'updateConfig', playerId, patch });
    }),
  );

  socket.on(
    'lobby:kick',
    validated('lobby:kick', lobbyKickSchema, logger, ({ playerId: targetId }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'kick', playerId, targetId });
    }),
  );
}

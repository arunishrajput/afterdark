/** In-lobby actions: ready, settings, kick (PROTOCOL Phase 1). */
import {
  gameCommandSchema,
  lobbyKickSchema,
  lobbySetReadySchema,
  lobbyUpdateConfigSchema,
  randomId,
} from '@afterdark/shared';

import { type GatewayContext, requireBinding, run } from '../context';
import { validated } from '../handler';
import type { GameSocket } from '../types';

const REMATCH_SALT_LENGTH = 24;

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

  // Back to the lobby after a game. The salt re-seeds the secrets (roles, spawns, radar aliases), so a
  // rematch does not repeat the last game; the engine is pure, so it is drawn here.
  socket.on(
    'lobby:playAgain',
    validated('lobby:playAgain', gameCommandSchema, logger, () => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'playAgain', playerId, salt: randomId(REMATCH_SALT_LENGTH) });
    }),
  );
}

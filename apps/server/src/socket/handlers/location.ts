/** Location, boundary and test-mode actions (PROTOCOL Phase 2). */
import { devTeleportSchema, lobbySetBoundarySchema, locUpdateSchema } from '@afterdark/shared';

import { type GatewayContext, requireBinding, run } from '../context';
import { HandlerError, validated } from '../handler';
import type { GameSocket } from '../types';

export function registerLocationHandlers(ctx: GatewayContext, socket: GameSocket): void {
  const { logger } = ctx;

  // Fire-and-forget (volatile, no ack): a rejected fix is simply not stored.
  socket.on(
    'loc:update',
    validated('loc:update', locUpdateSchema, logger, (fix) => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'locUpdate', playerId, fix });
    }),
  );

  socket.on(
    'lobby:setBoundary',
    validated('lobby:setBoundary', lobbySetBoundarySchema, logger, ({ boundary }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'setBoundary', playerId, boundary });
      const areaM2 = room.state.boundary?.areaM2;
      if (areaM2 === undefined) throw new HandlerError('INTERNAL', 'Boundary was not stored');
      return { areaM2 };
    }),
  );

  socket.on(
    'dev:teleport',
    validated('dev:teleport', devTeleportSchema, logger, ({ lat, lng }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'teleport', playerId, lat, lng });
    }),
  );
}

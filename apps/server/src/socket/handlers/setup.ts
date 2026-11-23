/** Host setup actions after the boundary (PROTOCOL Phase 3). */
import {
  lobbyEditTaskPointsSchema,
  lobbyRegenerateRegionsSchema,
  lobbyRenameRegionSchema,
  lobbySetBaseSchema,
  lobbySetNoGoZonesSchema,
} from '@afterdark/shared';

import { type GatewayContext, requireBinding, run } from '../context';
import { validated } from '../handler';
import type { GameSocket } from '../types';

export function registerSetupHandlers(ctx: GatewayContext, socket: GameSocket): void {
  const { logger } = ctx;

  socket.on(
    'lobby:regenerateRegions',
    validated('lobby:regenerateRegions', lobbyRegenerateRegionsSchema, logger, (input) => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'regenerateRegions', playerId, input });
    }),
  );

  socket.on(
    'lobby:renameRegion',
    validated('lobby:renameRegion', lobbyRenameRegionSchema, logger, ({ regionId, name }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'renameRegion', playerId, regionId, name });
    }),
  );

  socket.on(
    'lobby:editTaskPoints',
    validated('lobby:editTaskPoints', lobbyEditTaskPointsSchema, logger, (input) => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'editTaskPoints', playerId, input });
    }),
  );

  socket.on(
    'lobby:setNoGoZones',
    validated('lobby:setNoGoZones', lobbySetNoGoZonesSchema, logger, ({ zones }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'setNoGoZones', playerId, zones });
    }),
  );

  socket.on(
    'lobby:setBase',
    validated('lobby:setBase', lobbySetBaseSchema, logger, (base) => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'setBase', playerId, base });
    }),
  );
}

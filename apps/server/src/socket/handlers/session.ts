/** Session lifecycle: create, join, resume, leave (PROTOCOL Phase 1). */
import {
  lobbyCreateSchema,
  lobbyJoinSchema,
  lobbyLeaveSchema,
  randomId,
  sessionResumeSchema,
} from '@afterdark/shared';

import {
  bindSocket,
  type GatewayContext,
  requireBinding,
  requireUnbound,
  run,
  sendViewNow,
} from '../context';
import { HandlerError, validated } from '../handler';
import { clientAddress } from '../lobbyLimits';
import type { GameSocket } from '../types';

export function registerSessionHandlers(ctx: GatewayContext, socket: GameSocket): void {
  const { logger, rooms, sessions } = ctx;

  socket.on(
    'lobby:create',
    validated('lobby:create', lobbyCreateSchema, logger, ({ username }) => {
      requireUnbound(socket);
      // The address is used for this check only and never logged.
      const verdict = ctx.createGuard.admit(clientAddress(socket.handshake), rooms.size);
      if (verdict !== 'ok') {
        logger.warn({ verdict }, 'lobby create refused');
        if (verdict === 'full') throw new HandlerError('SERVER_BUSY', 'The server is full');
        throw new HandlerError('RATE_LIMITED', 'Too many new lobbies from this network');
      }
      const playerId = randomId();
      const room = rooms.create({ playerId, username });
      const token = sessions.issue(room.code, playerId);
      bindSocket(ctx, socket, room, playerId);
      sendViewNow(ctx, room, playerId);
      logger.info({ code: room.code, playerId }, 'lobby created');
      return { code: room.code, token, playerId };
    }),
  );

  socket.on(
    'lobby:join',
    validated('lobby:join', lobbyJoinSchema, logger, ({ code, username }) => {
      requireUnbound(socket);
      const room = rooms.get(code);
      if (!room) throw new HandlerError('NOT_FOUND', 'No lobby with that code');
      const playerId = randomId();
      run(room, { type: 'join', playerId, username });
      const token = sessions.issue(room.code, playerId);
      bindSocket(ctx, socket, room, playerId);
      sendViewNow(ctx, room, playerId);
      logger.info({ code, playerId }, 'player joined');
      return { token, playerId };
    }),
  );

  socket.on(
    'session:resume',
    validated('session:resume', sessionResumeSchema, logger, ({ token }) => {
      const session = sessions.resolve(token);
      if (session.status === 'kicked') {
        throw new HandlerError('KICKED', 'You were removed from this lobby');
      }
      const room = session.status === 'ok' ? rooms.get(session.code) : undefined;
      if (session.status !== 'ok' || !room) {
        throw new HandlerError('NOT_FOUND', 'That session has ended');
      }
      const { playerId } = session;
      if (socket.data.playerId !== undefined && socket.data.playerId !== playerId) {
        throw new HandlerError('NOT_ALLOWED', 'Leave your current lobby first');
      }
      run(room, { type: 'connect', playerId });
      bindSocket(ctx, socket, room, playerId);
      sendViewNow(ctx, room, playerId);
      logger.info({ code: room.code, playerId }, 'session resumed');
      return { playerId, code: room.code };
    }),
  );

  socket.on(
    'lobby:leave',
    validated('lobby:leave', lobbyLeaveSchema, logger, () => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'leave', playerId });
    }),
  );
}

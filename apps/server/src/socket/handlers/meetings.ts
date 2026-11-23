/** Meetings (PROTOCOL Phase 8): call one, skip the discussion, cast a vote. The server decides everything else. */
import { meetingCommandSchema, meetingVoteSchema } from '@afterdark/shared';

import { type GatewayContext, requireBinding, run } from '../context';
import { validated } from '../handler';
import type { GameSocket } from '../types';

export function registerMeetingHandlers(ctx: GatewayContext, socket: GameSocket): void {
  const { logger } = ctx;

  socket.on(
    'meeting:call',
    validated('meeting:call', meetingCommandSchema, logger, () => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'meetingCall', playerId });
    }),
  );

  socket.on(
    'meeting:skipDiscussion',
    validated('meeting:skipDiscussion', meetingCommandSchema, logger, () => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'meetingSkipDiscussion', playerId });
    }),
  );

  socket.on(
    'meeting:vote',
    validated('meeting:vote', meetingVoteSchema, logger, ({ target }) => {
      const { room, playerId } = requireBinding(ctx, socket);
      run(room, { type: 'meetingVote', playerId, target });
    }),
  );
}

/**
 * The meeting part of a view (MEETINGS §3, PROTOCOL › MeetingView). The shape is
 * the same for crew, imposters and spectators: the roster, who has arrived, how
 * many have acted, and only the viewer's own vote. After the vote it adds the
 * tallies (counts per candidate and Skip) and the outcome. Nobody's vote is ever
 * attributed (ROLES.md), so `votes` is read only to answer "did the viewer vote"
 * and "how many have". Every field is copied explicitly.
 */
import type { MeetingView } from '@afterdark/shared';

import type { PlayerState, RoomState } from '../engine/state';
import { isActive } from '../engine/systems/players';

export function projectMeeting(state: RoomState, viewerId: string): MeetingView | undefined {
  const m = state.game?.meeting;
  if (!m) return undefined;
  const caller = state.players.find((p) => p.id === m.calledById);
  const roster = state.players.filter((p) => !p.left);
  const waiting = roster.filter((p) => isActive(p) && p.connected);
  const done = (p: PlayerState): boolean => {
    if (m.stage === 'gather') return m.gathered.includes(p.id);
    if (m.stage === 'discuss') return m.skips.includes(p.id);
    return m.votes[p.id] !== undefined;
  };
  const mine = m.votes[viewerId];
  const ejected =
    m.ejectedId === undefined ? undefined : state.players.find((p) => p.id === m.ejectedId);
  const view: MeetingView = {
    stage: m.stage,
    endsAt: m.stageEndsAt,
    calledBy: caller?.username ?? '',
    gathered: [...m.gathered],
    roster: roster.map((p) => ({
      playerId: p.id,
      username: p.username,
      status: p.spectator ? 'spectator' : 'active',
      connected: p.connected,
    })),
    progress: {
      done: waiting.filter(done).length,
      total: waiting.length,
    },
  };
  if (m.pausedAt !== undefined) view.pausedAt = m.pausedAt;
  if (mine !== undefined) view.myVote = mine;
  if (m.stage === 'result' && m.tallies) {
    view.tallies = m.tallies.map((t) => ({ target: t.target, count: t.count }));
    view.outcome = ejected
      ? {
          ejectedId: ejected.id,
          ejectedUsername: ejected.username,
          wasImposter: ejected.revealedRole === 'imposter',
        }
      : {};
  }
  return view;
}

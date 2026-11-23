/**
 * The end-of-game reveal (Phase 12, SCORING › awards, ADR-095). Built from the final state and
 * the event log, and only once the game has `ended`: before that every field here is secret
 * (roles, classes, tags, infection times, who planted what). The same for every viewer.
 * Like every view it copies explicit fields; nothing from the log or a player is spread.
 */
import type {
  ResultsAwards,
  ResultsMeeting,
  ResultsPlayer,
  ResultsScorePoint,
  ResultsTimelineEntry,
  ResultsView,
} from '@afterdark/shared';

import type { PlayerState, RoomState } from '../engine/state';
import { entriesOf, type LogEntry } from '../engine/systems/log';
import { compromisedCount } from '../engine/systems/victory';

const MS_PER_S = 1000;

const seconds = (gameMs: number): number => Math.max(0, Math.round(gameMs / MS_PER_S));

/** How many entries of `type` name `id` as their first actor. */
function countBy(
  log: readonly LogEntry[],
  type: 'task' | 'fooled' | 'infectDone',
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of entriesOf(log, type)) {
    const id = e.actors[0];
    if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function projectPlayer(
  p: PlayerState & { role: NonNullable<PlayerState['role']> },
  log: readonly LogEntry[],
  tallies: {
    tasks: Map<string, number>;
    fooled: Map<string, number>;
    infections: Map<string, number>;
  },
  coopDone: Map<string, number>,
): ResultsPlayer {
  const infectedAt = entriesOf(log, 'infected').find((e) => e.actors[0] === p.id);
  return {
    id: p.id,
    username: p.username,
    role: p.role,
    ...(p.role === 'imposter' && p.classes ? { classes: [...p.classes] } : {}),
    tag: p.tag ?? '',
    personalScore: p.personalScore ?? 0,
    tasksDone: (tallies.tasks.get(p.id) ?? 0) + (p.role === 'crew' ? (coopDone.get(p.id) ?? 0) : 0),
    fooled: tallies.fooled.get(p.id) ?? 0,
    distanceM: Math.round(p.walkedM ?? 0),
    infections: p.role === 'imposter' ? (tallies.infections.get(p.id) ?? 0) : 0,
    meetingsCalled: p.meetingsCalled ?? 0,
    ...(infectedAt ? { infectedAtS: seconds(infectedAt.gameMs) } : {}),
    ejected: p.spectator === true,
    left: p.left === true,
  };
}

function timelineOf(log: readonly LogEntry[]): ResultsTimelineEntry[] {
  const out: ResultsTimelineEntry[] = [];
  for (const e of log) {
    const atS = seconds(e.gameMs);
    const actor = e.actors[0];
    switch (e.type) {
      case 'infectDone':
        out.push({
          atS,
          kind: 'exposed',
          ...(actor ? { actorId: actor } : {}),
          ...(e.actors[1] ? { targetId: e.actors[1] } : {}),
        });
        break;
      case 'infected':
        out.push({
          atS,
          kind: 'infected',
          actorId: e.data.by,
          ...(actor ? { targetId: actor } : {}),
        });
        break;
      case 'meetingResult':
        if (e.data.ejectedId) out.push({ atS, kind: 'ejected', targetId: e.data.ejectedId });
        break;
      case 'taskStop':
      case 'fakePlanted':
      case 'camouflage':
        out.push({ atS, kind: e.type, ...(actor ? { actorId: actor } : {}) });
        break;
      case 'pause':
        out.push({ atS, kind: 'paused' });
        break;
      case 'resume':
        out.push({ atS, kind: 'resumed' });
        break;
      default:
        break;
    }
  }
  return out;
}

/** Each meeting, in order: the caller from its `meetingCalled` entry, the counts and outcome from its `meetingResult`. */
function meetingsOf(log: readonly LogEntry[]): ResultsMeeting[] {
  const out: ResultsMeeting[] = [];
  let caller: { atS: number; id: string } | undefined;
  for (const e of log) {
    if (e.type === 'meetingCalled') caller = { atS: seconds(e.gameMs), id: e.actors[0] ?? '' };
    else if (e.type === 'meetingResult' && caller) {
      out.push({
        atS: caller.atS,
        calledById: caller.id,
        tallies: e.data.tallies.map((t) => ({ target: t.target, count: t.count })),
        ...(e.data.ejectedId ? { ejectedId: e.data.ejectedId } : {}),
        ...(e.data.wasImposter !== undefined ? { wasImposter: e.data.wasImposter } : {}),
      });
      caller = undefined;
    }
  }
  return out;
}

/** The team score every `sampleS` of game time, from the task and co-op entries, ending on the real final score. */
export function scoreSeriesOf(
  log: readonly LogEntry[],
  durationMs: number,
  sampleS: number,
  finalScore: number,
): ResultsScorePoint[] {
  const gains: { gameMs: number; points: number }[] = [];
  for (const e of log) {
    if (e.type === 'task') gains.push({ gameMs: e.gameMs, points: e.data.points });
    else if (e.type === 'coop') gains.push({ gameMs: e.gameMs, points: e.data.team });
  }
  const out: ResultsScorePoint[] = [];
  const stepMs = sampleS * MS_PER_S;
  let total = 0;
  let i = 0;
  for (let t = 0; t < durationMs; t += stepMs) {
    while (i < gains.length && (gains[i]?.gameMs ?? Infinity) <= t)
      total += gains[i++]?.points ?? 0;
    out.push({ atS: seconds(t), team: total });
  }
  out.push({ atS: seconds(durationMs), team: finalScore });
  return out;
}

/** The first player with the highest value above zero (join order breaks a tie). */
function best(players: ResultsPlayer[], valueOf: (p: ResultsPlayer) => number) {
  let top: { playerId: string; value: number } | undefined;
  for (const p of players) {
    const value = valueOf(p);
    if (value > 0 && (!top || value > top.value)) top = { playerId: p.id, value };
  }
  return top;
}

function awardsOf(players: ResultsPlayer[]): ResultsAwards {
  const crewMvp = best(
    players.filter((p) => p.role === 'crew'),
    (p) => p.personalScore,
  );
  const topInfector = best(
    players.filter((p) => p.role === 'imposter'),
    (p) => p.infections,
  );
  const mostFooled = best(players, (p) => p.fooled);
  return {
    ...(crewMvp ? { crewMvp } : {}),
    ...(topInfector ? { topInfector } : {}),
    ...(mostFooled ? { mostFooled } : {}),
  };
}

/** `undefined` unless the game has ended with roles assigned (an abort during the spawn phase has nothing to reveal). */
export function projectResults(state: RoomState): ResultsView | undefined {
  const game = state.game;
  if (state.phase !== 'ended' || !state.result || !game) return undefined;
  const { log } = game;
  const end = entriesOf(log, 'end').at(-1);
  const durationMs = end?.gameMs ?? game.matchEndsAtGameMs;

  const tallies = {
    tasks: countBy(log, 'task'),
    fooled: countBy(log, 'fooled'),
    infections: countBy(log, 'infectDone'),
  };
  const coopDone = new Map<string, number>();
  for (const e of entriesOf(log, 'coop')) {
    for (const id of e.actors) coopDone.set(id, (coopDone.get(id) ?? 0) + 1);
  }
  const players = state.players
    .filter(
      (p): p is PlayerState & { role: NonNullable<PlayerState['role']> } => p.role !== undefined,
    )
    .map((p) => projectPlayer(p, log, tallies, coopDone));

  return {
    winner: state.result.winner,
    reason: state.result.reason,
    aborted: state.result.reason === 'abort',
    teamScore: game.teamScore,
    targetScore: state.config.targetScore,
    compromised: compromisedCount(state),
    threshold: game.threshold,
    crewCount: game.originalCrewCount,
    durationS: seconds(durationMs),
    players,
    timeline: timelineOf(log),
    meetings: meetingsOf(log),
    scoreSeries: scoreSeriesOf(log, durationMs, state.config.scoreSampleS, game.teamScore),
    awards: awardsOf(players),
  };
}

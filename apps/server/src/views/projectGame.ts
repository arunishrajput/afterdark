/**
 * The game-phase part of a player's view (Phase 4): their own spawn, tag, role
 * and zone, plus the public game numbers. Every field is copied explicitly.
 * What a crew member gets has exactly the same keys whatever their infection
 * status, and a crew view has no `imposter` key at all (ROLES.md visibility
 * matrix, leak tests 1, 2 and 4).
 */
import type { AbilityState, FakeView, GameView, ImposterView, MeView } from '@afterdark/shared';

import { clockView, gameNow } from '../engine/clock';
import type { PlayerState, RoomState } from '../engine/state';
import { abilitiesOf } from '../engine/systems/abilities';
import { meetingsLeft } from '../engine/systems/meetings';
import { isActive } from '../engine/systems/players';
import { projectRegionCounts } from '../engine/systems/regionCounts';
import { spawnProgress } from '../engine/systems/spawn';
import { isTaskLocked } from '../engine/systems/taskStop';
import { compromisedCount } from '../engine/systems/victory';
import { projectMeeting } from './projectMeeting';
import { projectRerollReadyAt, projectTasks } from './projectTasks';

const MS_PER_S = 1000;

/**
 * A game-time deadline as server epoch ms. Constant while the clock runs or is
 * stopped (like `clockView`), so a view only changes when something happens.
 * Before play the clock has not started: the deadline counts from the reveal's end.
 */
function deadlineAt(state: RoomState, gameMs: number, now: number): number {
  const g = state.game;
  if (!g) return now;
  return g.clock.started ? clockView(g.clock, gameMs, now).endsAt : g.revealEndsAt + gameMs;
}

/** An imposter's class abilities with their ready times as constant server-epoch deadlines. */
function projectAbilities(state: RoomState, p: PlayerState, now: number): AbilityState[] {
  return abilitiesOf(p).map(([id, a]) => ({
    id,
    readyAt: deadlineAt(state, a.readyAtGameMs, now),
  }));
}

/** The Phantom's own fakes: the ones waiting in the queue, then the ones a crew slot holds (ROLES.md). Only their own are ever listed. */
function projectFakes(state: RoomState, me: PlayerState): FakeView[] {
  if (!me.abilities?.fakeTask) return [];
  const queued = (state.game?.fakeQueue ?? [])
    .filter((f) => f.ownerId === me.id)
    .map((f) => ({ id: f.id, lat: f.lat, lng: f.lng, assigned: false }));
  const held = state.players.flatMap((p) =>
    (p.tasks ?? [])
      .filter((t) => t.fake && t.fakeOwnerId === me.id)
      .map((t) => ({ id: t.id, lat: t.lat, lng: t.lng, assigned: true })),
  );
  return [...held, ...queued];
}

/**
 * Imposters see the others' username, tag and class (RULES §5.4), their own Infect
 * state, and who is exposed or infected, whichever imposter caused it (ROLES.md).
 * This is the only place infection status leaves the engine.
 */
function projectImposter(state: RoomState, me: PlayerState, now: number): ImposterView {
  const channel = me.infect?.channel;
  // Exposed, infected and (RULES §8) wrongly ejected crew: the imposter's own count of who is compromised.
  const affected = state.players.filter((p) => p.infection !== undefined || p.wronglyEjected);
  return {
    infect: {
      readyAt: deadlineAt(state, me.infect?.readyAtGameMs ?? 0, now),
      ...(channel
        ? {
            channel: {
              endsAt: deadlineAt(state, channel.endsAtGameMs, now),
              inRange: channel.inRange,
            },
          }
        : {}),
    },
    abilities: projectAbilities(state, me, now),
    fakes: projectFakes(state, me),
    compromisedIds: affected.map((p) => p.id),
    exposures: affected
      .filter((p) => p.infection === 'exposed')
      .map((p) => {
        const ends = p.exposure?.incubationEndsAtGameMs;
        return {
          playerId: p.id,
          ...(ends === undefined ? {} : { incubationEndsAt: deadlineAt(state, ends, now) }),
        };
      }),
    classes: [...(me.classes ?? [])],
    allies: state.players
      .filter((p) => p.id !== me.id && p.role === 'imposter' && isActive(p))
      .map((p) => ({
        playerId: p.id,
        username: p.username,
        tag: p.tag ?? '',
        classes: [...(p.classes ?? [])],
        abilities: projectAbilities(state, p, now),
      })),
  };
}

/** The viewer's own private game fields. Empty in the lobby. */
export function projectOwnGame(
  state: RoomState,
  me: PlayerState,
  now: number,
): Pick<MeView, 'spawn' | 'tag' | 'role' | 'imposter' | 'personalScore' | 'zone'> {
  const out: Pick<MeView, 'spawn' | 'tag' | 'role' | 'imposter' | 'personalScore' | 'zone'> = {};
  if (me.spawn) out.spawn = { lat: me.spawn.lat, lng: me.spawn.lng, reached: me.spawn.reached };
  if (!state.game || !me.role || me.tag === undefined) return out;
  out.tag = me.tag;
  out.role = me.role;
  out.personalScore = me.personalScore ?? 0;
  // An ejected imposter loses the whole imposter block (ROLES.md › Spectator).
  if (me.role === 'imposter' && isActive(me)) out.imposter = projectImposter(state, me, now);
  if (state.phase === 'playing') {
    const grace = state.config.zoneGraceS * MS_PER_S;
    const outSince = me.zone?.outSince;
    const left = outSince === undefined ? 0 : outSince + grace - gameNow(state.game.clock, now);
    // The grace deadline only makes sense while the clock runs and the grace has not passed.
    const running = state.game.clock.runningSince !== undefined;
    out.zone = {
      oob: me.zone !== undefined,
      ...(me.zone && running && left > 0 ? { graceEndsAt: now + left } : {}),
    };
  }
  return out;
}

/** Public game numbers (identical for every viewer), plus the viewer's own task cards. */
export function projectGame(state: RoomState, viewerId: string, now: number): GameView {
  const game: GameView = { regionCounts: projectRegionCounts(state, viewerId, now) };
  if (state.phase === 'spawning' && state.spawnEndsAt !== undefined) {
    game.spawn = { ...spawnProgress(state), endsAt: state.spawnEndsAt };
  }
  const g = state.game;
  if (!g) return game;
  if (state.phase === 'reveal') game.revealEndsAt = g.revealEndsAt;
  if (state.phase === 'reveal' || state.phase === 'playing') {
    // Before play the clock has not started: the match will end a full match length after the reveal.
    game.clock = g.clock.started
      ? clockView(g.clock, g.matchEndsAtGameMs, now)
      : { endsAt: g.revealEndsAt + g.matchEndsAtGameMs };
  }
  game.teamScore = g.teamScore;
  game.targetScore = state.config.targetScore;
  game.compromised = compromisedCount(state);
  game.threshold = g.threshold;
  game.crewCount = g.originalCrewCount;
  const me = state.players.find((p) => p.id === viewerId);
  if (me) game.meetingsLeft = isActive(me) ? meetingsLeft(state, me) : 0;
  if (state.phase === 'playing' && g.taskLock && isTaskLocked(state, now)) {
    game.taskLock = { until: deadlineAt(state, g.taskLock.untilGameMs, now) };
  }
  const meeting = projectMeeting(state, viewerId);
  if (meeting) game.meeting = meeting;
  if (state.phase === 'playing' && me?.role) {
    // The viewer's own cards: an imposter gets an empty list (Phase 10 adds their partner slot).
    game.tasks = projectTasks(state, me);
    const rerollReadyAt = projectRerollReadyAt(state, me, now);
    if (rerollReadyAt !== undefined) game.rerollReadyAt = rerollReadyAt;
  }
  if (state.phase === 'ended' && state.result) {
    game.result = { winner: state.result.winner, reason: state.result.reason };
  }
  return game;
}

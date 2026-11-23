/**
 * The game-phase part of a player's view (Phase 4): their own spawn, tag, role
 * and zone, plus the public game numbers. Every field is copied explicitly.
 * What a crew member gets has exactly the same keys whatever their infection
 * status, and a crew view has no `imposter` key at all (ROLES.md visibility
 * matrix, leak tests 1, 2 and 4).
 */
import type { GameView, ImposterView, MeView } from '@afterdark/shared';

import { clockView, gameNow } from '../engine/clock';
import type { PlayerState, RoomState } from '../engine/state';
import { projectRegionCounts } from '../engine/systems/regionCounts';
import { spawnProgress } from '../engine/systems/spawn';
import { compromisedCount } from '../engine/systems/victory';

const MS_PER_S = 1000;

/** Imposters see the others' username, tag and class (RULES §5.4). Nothing about infection yet. */
function projectImposter(state: RoomState, me: PlayerState): ImposterView {
  return {
    classes: [...(me.classes ?? [])],
    allies: state.players
      .filter((p) => p.id !== me.id && p.role === 'imposter' && !p.left)
      .map((p) => ({
        playerId: p.id,
        username: p.username,
        tag: p.tag ?? '',
        classes: [...(p.classes ?? [])],
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
  if (me.role === 'imposter') out.imposter = projectImposter(state, me);
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

/** Public game numbers: identical for every viewer. */
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
  game.meetingsLeft = state.config.meetingsPerPlayer;
  if (state.phase === 'ended' && state.result) {
    game.result = { winner: state.result.winner, reason: state.result.reason };
  }
  return game;
}

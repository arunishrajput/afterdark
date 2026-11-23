/**
 * Infect (RULES §7.1): an imposter channels on the nearest healthy crew member
 * within `infectionRadiusM`; when the channel completes the target is exposed;
 * incubation starts once the exposing imposter has left; when it ends the target
 * is infected and counts toward V3. Everything runs on game time, so a host
 * pause (and later a meeting) freezes channels, gaps and incubation. The target
 * is never told: the only events are private to the imposter, plus one public
 * `game.compromised` count when a box fills (ADR-067). Pure.
 */
import { distanceM, type LatLng } from '@afterdark/shared';

import { gameNow, isRunning, wallTimeOf } from '../clock';
import type { PlayerState, RoomState } from '../state';
import { type Effect, RuleError } from '../types';
import { fixQuality, requireGoodFix } from './location';
import { findPlayer } from './players';
import { compromisedCount } from './victory';
import { isOutOfBounds, isZoneLocked } from './zone';

const MS_PER_S = 1000;

/** A good, fresh fix: the only kind that can start, hold or measure an infection. */
const goodLoc = (state: RoomState, p: PlayerState, now: number): LatLng | undefined =>
  p.loc && fixQuality(p.loc, now, state.config) === 'good' ? p.loc : undefined;

/** Healthy, active crew: the only players who can be exposed (RULES §7.1.5, E7). */
const isHealthyCrew = (p: PlayerState): boolean =>
  p.role === 'crew' && !p.left && !p.spectator && p.infection === undefined;

/** Both have a good fix and are within `infectionRadiusM`. */
function inReach(state: RoomState, imp: PlayerState, target: PlayerState, now: number): boolean {
  const a = goodLoc(state, imp, now);
  const b = goodLoc(state, target, now);
  return a !== undefined && b !== undefined && distanceM(a, b) <= state.config.infectionRadiusM;
}

/** A running meeting blocks Infect; the post-meeting grace is a cooldown pushed on every imposter when the meeting ends (RULES §7.1.7, `endMeeting`). */
const blockedByMeeting = (state: RoomState): boolean => state.game?.meeting !== undefined;

/** The closest eligible target: nearest first, join order breaks a tie. */
function nearestTarget(state: RoomState, imp: PlayerState, now: number): PlayerState | undefined {
  const from = goodLoc(state, imp, now);
  if (!from) return undefined;
  let best: { p: PlayerState; d: number } | undefined;
  for (const p of state.players) {
    if (!isHealthyCrew(p)) continue;
    const at = goodLoc(state, p, now);
    if (!at) continue;
    const d = distanceM(from, at);
    if (d <= state.config.infectionRadiusM && (!best || d < best.d)) best = { p, d };
  }
  return best?.p;
}

/** `ability:infect`: start a channel on the nearest eligible target. */
export function startInfect(
  state: RoomState,
  playerId: string,
  now: number,
  effects: Effect[],
): void {
  const game = state.game;
  if (state.phase !== 'playing' || !game) throw new RuleError('WRONG_PHASE', 'Not playing');
  const imp = findPlayer(state, playerId);
  if (imp.role !== 'imposter' || imp.left || !imp.infect) {
    throw new RuleError('NOT_ALLOWED', 'Only an active imposter can infect');
  }
  if (blockedByMeeting(state)) throw new RuleError('MEETING_ACTIVE', 'Not during a meeting');
  if (imp.infect.channel) throw new RuleError('NOT_ALLOWED', 'Already infecting someone');
  requireGoodFix(imp, state.config, now);
  if (isZoneLocked(imp) || (imp.loc && isOutOfBounds(state, imp.loc))) {
    throw new RuleError('OUT_OF_BOUNDS', 'Get back inside the area first');
  }
  const gameMs = gameNow(game.clock, now);
  if (gameMs < imp.infect.readyAtGameMs) throw new RuleError('COOLDOWN', 'Infect is recharging');
  const target = nearestTarget(state, imp, now);
  if (!target) throw new RuleError('OUT_OF_RANGE', 'No one is close enough');
  const endsAtGameMs = gameMs + state.config.infectionChannelS * MS_PER_S;
  imp.infect.channel = { targetId: target.id, endsAtGameMs, inRange: true };
  effects.push({
    kind: 'reply',
    playerId,
    reply: {
      type: 'infect',
      ack: { channelEndsAt: wallTimeOf(game.clock, endsAtGameMs, now) ?? now },
    },
  });
}

/** `ability:cancelInfect`: stop a channel. No cooldown, and nothing if there is none. */
export function cancelInfect(state: RoomState, playerId: string): void {
  const imp = findPlayer(state, playerId);
  if (imp.infect) delete imp.infect.channel;
}

/** Drops every channel (a meeting starts, Phase 8). Nobody goes on cooldown. */
export function cancelAllChannels(state: RoomState, reason: 'meeting', effects: Effect[]): void {
  for (const p of state.players) {
    if (!p.infect?.channel) continue;
    delete p.infect.channel;
    effects.push({ kind: 'event', to: [p.id], event: { type: 'infect.failed', reason } });
  }
}

/** RULES §9.3: an out-of-bounds imposter's cooldown does not run down. */
function freezeCooldowns(state: RoomState, gameMs: number, elapsedMs: number): void {
  if (elapsedMs <= 0) return;
  for (const p of state.players) {
    if (p.infect && p.zone && p.infect.readyAtGameMs > gameMs - elapsedMs) {
      p.infect.readyAtGameMs += elapsedMs;
    }
  }
}

function complete(
  state: RoomState,
  imp: PlayerState,
  target: PlayerState,
  gameMs: number,
  effects: Effect[],
): void {
  if (!imp.infect) return;
  target.infection = 'exposed';
  target.exposure = { byId: imp.id };
  delete imp.infect.channel;
  imp.infect.completed += 1;
  imp.infect.readyAtGameMs = gameMs + state.config.infectionCooldownS * MS_PER_S;
  effects.push({ kind: 'event', to: [imp.id], event: { type: 'infect.completed' } });
}

function updateChannels(state: RoomState, now: number, gameMs: number, effects: Effect[]): void {
  const { config } = state;
  const running = state.players
    .filter((p) => p.infect?.channel)
    // The first channel to finish wins a contested target (E6); join order breaks a tie.
    .sort(
      (a, b) => (a.infect?.channel?.endsAtGameMs ?? 0) - (b.infect?.channel?.endsAtGameMs ?? 0),
    );
  for (const imp of running) {
    const channel = imp.infect?.channel;
    if (!imp.infect || !channel) continue;
    const target = state.players.find((p) => p.id === channel.targetId);
    if (imp.left) {
      delete imp.infect.channel;
      continue;
    }
    if (!target || !isHealthyCrew(target)) {
      delete imp.infect.channel;
      effects.push({
        kind: 'event',
        to: [imp.id],
        event: { type: 'infect.failed', reason: 'target' },
      });
      continue;
    }
    channel.inRange = !isZoneLocked(imp) && inReach(state, imp, target, now);
    if (channel.inRange) delete channel.gapSince;
    else channel.gapSince ??= gameMs;
    if (
      channel.gapSince !== undefined &&
      gameMs - channel.gapSince > config.infectionGapToleranceS * MS_PER_S
    ) {
      delete imp.infect.channel;
      effects.push({
        kind: 'event',
        to: [imp.id],
        event: { type: 'infect.failed', reason: 'range' },
      });
      continue;
    }
    if (channel.inRange && gameMs >= channel.endsAtGameMs)
      complete(state, imp, target, gameMs, effects);
  }
}

function updateIncubation(state: RoomState, now: number, gameMs: number, effects: Effect[]): void {
  const { config } = state;
  for (const target of state.players) {
    const ex = target.exposure;
    if (target.infection !== 'exposed' || !ex) continue;
    if (ex.incubationEndsAtGameMs === undefined) {
      const by = state.players.find((p) => p.id === ex.byId);
      const byAt = by && !by.left && !by.spectator ? goodLoc(state, by, now) : undefined;
      const near =
        byAt !== undefined &&
        target.loc !== undefined &&
        distanceM(byAt, target.loc) <= config.infectionRadiusM;
      if (near) {
        delete ex.awaySince;
      } else {
        ex.awaySince ??= gameMs;
        const departMs = config.incubationDepartS * MS_PER_S;
        if (gameMs - ex.awaySince >= departMs) {
          ex.incubationEndsAtGameMs = ex.awaySince + departMs + config.incubationS * MS_PER_S;
        }
      }
    }
    if (ex.incubationEndsAtGameMs !== undefined && gameMs >= ex.incubationEndsAtGameMs) {
      target.infection = 'infected';
      delete target.exposure;
      effects.push({
        kind: 'event',
        to: 'all',
        event: { type: 'game.compromised', count: compromisedCount(state) },
      });
    }
  }
}

/** Runs from `advance()` after the zone, on every command and tick while `playing`. */
export function updateInfection(state: RoomState, now: number, effects: Effect[]): void {
  const game = state.game;
  if (state.phase !== 'playing' || !game || !isRunning(game.clock)) return;
  const gameMs = gameNow(game.clock, now);
  const elapsed = gameMs - game.lastInfectGameMs;
  game.lastInfectGameMs = gameMs;
  freezeCooldowns(state, gameMs, elapsed);
  updateChannels(state, now, gameMs, effects);
  updateIncubation(state, now, gameMs, effects);
}

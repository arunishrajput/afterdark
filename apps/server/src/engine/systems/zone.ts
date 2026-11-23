/**
 * Zone (RULES §9): out of bounds means outside the boundary or inside a no-go
 * zone, judged on good fixes only. After `zoneGraceS` a player loses personal
 * points at an interval until they return. Time here is game time, so a host
 * pause (and later a meeting) freezes the penalties. Penalties are personal:
 * they never touch the team score (ADR-012).
 */
import { type LatLng, pointInRing } from '@afterdark/shared';

import { gameNow } from '../clock';
import type { PlayerState, RoomState } from '../state';
import type { Effect } from '../types';
import { fixQuality } from './location';
import { activePlayers } from './players';

const MS_PER_S = 1000;

/** Outside the boundary ring, or inside any no-go zone. False before a boundary exists. */
export function isOutOfBounds(state: RoomState, at: LatLng): boolean {
  if (!state.boundary) return false;
  if (!pointInRing(at, state.boundary.ring)) return true;
  return state.setup.noGo.some((zone) => pointInRing(at, zone));
}

/** A locked player can't open tasks or use abilities (RULES §9.3). Later phases check this. */
export const isZoneLocked = (p: PlayerState): boolean => p.zone !== undefined;

/** Penalty ticks due after `outForMs` out of bounds: the first at the end of the grace, then one per interval. */
export function penaltiesDue(
  outForMs: number,
  config: { zoneGraceS: number; zonePenaltyIntervalS: number },
): number {
  const graceMs = config.zoneGraceS * MS_PER_S;
  if (outForMs < graceMs) return 0;
  return Math.floor((outForMs - graceMs) / (config.zonePenaltyIntervalS * MS_PER_S)) + 1;
}

/** Runs on every accepted fix and every tick while `playing`. */
export function updateZone(state: RoomState, now: number, effects: Effect[]): void {
  const game = state.game;
  if (state.phase !== 'playing' || !game) return;
  const gameMs = gameNow(game.clock, now);
  for (const p of activePlayers(state)) {
    // Only a good (accurate and fresh) fix can change zone state (RULES §9.1).
    if (!p.loc || fixQuality(p.loc, now, state.config) !== 'good') continue;
    if (!isOutOfBounds(state, p.loc)) {
      delete p.zone;
      continue;
    }
    if (!p.zone) {
      p.zone = { outSince: gameMs, penalties: 0 };
      effects.push({ kind: 'event', to: [p.id], event: { type: 'zone.warning' } });
    }
    const due = penaltiesDue(gameMs - p.zone.outSince, state.config);
    const owed = due - p.zone.penalties;
    if (owed > 0) {
      const points = owed * state.config.zonePenaltyPoints;
      p.zone.penalties = due;
      p.personalScore = (p.personalScore ?? 0) - points;
      effects.push({ kind: 'event', to: [p.id], event: { type: 'zone.penalty', points } });
    }
  }
}

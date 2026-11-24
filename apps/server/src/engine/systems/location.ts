/**
 * Location pipeline (ARCHITECTURE §5, RULES §10). Fixes are validated by zod at
 * the edge; here the server checks time and plausibility, stores the latest
 * accepted fix per player and derives its quality. Pure: `now` is injected.
 */
import {
  distanceM,
  type GameConfig,
  type LocationQuality,
  type LocUpdatePayload,
} from '@afterdark/shared';

import type { PendingFix, PlayerState, RoomState, StoredFix } from '../state';
import { type Effect, RuleError } from '../types';
import { findPlayer } from './players';

const MS_PER_S = 1000;

type QualityConfig = Pick<GameConfig, 'maxAccuracyM' | 'staleAfterS'>;

/**
 * good: accurate enough and fresh. weak: accuracy worse than `maxAccuracyM`.
 * stale: nothing received for `staleAfterS` (server clock). Stale outranks weak.
 */
export function fixQuality(
  fix: Pick<StoredFix, 'accuracy' | 'receivedAt'>,
  now: number,
  config: QualityConfig,
): LocationQuality {
  if (now - fix.receivedAt > config.staleAfterS * MS_PER_S) return 'stale';
  return fix.accuracy <= config.maxAccuracyM ? 'good' : 'weak';
}

/** `setReady(true)` gate: WEAK_GPS with no or inaccurate fix, STALE when it is old. */
export function requireGoodFix(p: PlayerState, config: QualityConfig, now: number): void {
  if (!p.loc) throw new RuleError('WEAK_GPS', 'No location fix yet. Allow location and wait.');
  const q = fixQuality(p.loc, now, config);
  if (q === 'stale') throw new RuleError('STALE', 'Your location is out of date. Check your GPS.');
  if (q === 'weak')
    throw new RuleError('WEAK_GPS', 'GPS accuracy is too weak. Move into the open.');
}

interface TimedFix {
  lat: number;
  lng: number;
  /** Device time (server-aligned): the honest gap between two fixes. */
  ts: number;
  /** Server receive time: what really elapsed, give or take network bunching. */
  receivedAt: number;
}

/**
 * Implied speed in m/s. The gap is the device-time gap, but never more than the
 * server saw pass plus `minDtS` (a forged old `ts` cannot stretch it, ADR-108), and
 * never less than `minDtS` (near-simultaneous or out-of-order stamps cannot spike it, ADR-040).
 */
function impliedSpeed(from: TimedFix, to: TimedFix, minDtS: number): number {
  const deviceS = (to.ts - from.ts) / MS_PER_S;
  const serverS = (to.receivedAt - from.receivedAt) / MS_PER_S + minDtS;
  const dtS = Math.max(Math.min(deviceS, serverS), minDtS);
  return distanceM(from, to) / dtS;
}

function store(p: PlayerState, fix: LocUpdatePayload, now: number): void {
  p.loc = { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, ts: fix.ts, receivedAt: now };
  delete p.locPending;
}

/**
 * Distance walked (results screen, ADR-095): counted from the last counted spot, and only once a
 * good fix is `walkStepM` away from it, so jitter while standing still adds nothing. Only while
 * `playing`, for players with a role. Weak fixes change nothing.
 */
function addWalk(state: RoomState, p: PlayerState, fix: LocUpdatePayload): void {
  if (state.phase !== 'playing' || !p.role || fix.accuracy > state.config.maxAccuracyM) {
    return;
  }
  if (!p.walkFrom) {
    p.walkFrom = { lat: fix.lat, lng: fix.lng };
    return;
  }
  const d = distanceM(p.walkFrom, fix);
  if (d < state.config.walkStepM) return;
  p.walkedM = (p.walkedM ?? 0) + d;
  p.walkFrom = { lat: fix.lat, lng: fix.lng };
}

export function locUpdate(
  state: RoomState,
  playerId: string,
  fix: LocUpdatePayload,
  now: number,
  effects: Effect[],
): void {
  const { config } = state;
  const p = findPlayer(state, playerId);
  if (fix.ts > now + config.futureFixToleranceS * MS_PER_S) {
    throw new RuleError('INVALID_PAYLOAD', 'Fix timestamp is in the future');
  }
  const incoming = { lat: fix.lat, lng: fix.lng, ts: fix.ts, receivedAt: now };
  if (!p.loc || impliedSpeed(p.loc, incoming, config.speedCheckMinDtS) <= config.maxSpeedMps) {
    addWalk(state, p, fix);
    store(p, fix, now);
    return;
  }
  // Implausible jump: keep the old position, but remember fixes that agree with
  // each other. After `reanchorFixes` of them the player really is somewhere new.
  const last: PendingFix | undefined = p.locPending?.at(-1);
  const consistent =
    last && impliedSpeed(last, incoming, config.speedCheckMinDtS) <= config.maxSpeedMps;
  const run = consistent ? [...(p.locPending ?? [])] : [];
  run.push(incoming);
  if (run.length >= config.reanchorFixes) {
    // A jump the speed check refused is not walking: the count starts again from the new spot.
    delete p.walkFrom;
    store(p, fix, now);
    // Rare with real GPS (a stored outlier), routine for a spoofer: the count is logged (ADR-108).
    p.gpsReanchors = (p.gpsReanchors ?? 0) + 1;
    effects.push({ kind: 'audit', what: 'gpsReanchor', playerId, count: p.gpsReanchors });
  } else p.locPending = run;
}

/** `dev:teleport` (test mode only): place the player exactly, bypassing the speed check. */
export function teleport(
  state: RoomState,
  playerId: string,
  lat: number,
  lng: number,
  now: number,
): void {
  if (!state.config.testMode) throw new RuleError('NOT_ALLOWED', 'Test mode is off');
  const p = findPlayer(state, playerId);
  delete p.walkFrom;
  store(p, { lat, lng, accuracy: state.config.teleportAccuracyM, ts: now }, now);
}

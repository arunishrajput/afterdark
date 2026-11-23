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
import { RuleError } from '../types';
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

/** Implied speed in m/s; the time gap is floored so near-simultaneous stamps cannot spike it. */
function impliedSpeed(
  from: { lat: number; lng: number; ts: number },
  to: { lat: number; lng: number; ts: number },
  minDtS: number,
): number {
  const dtS = Math.max((to.ts - from.ts) / MS_PER_S, minDtS);
  return distanceM(from, to) / dtS;
}

function store(p: PlayerState, fix: LocUpdatePayload, now: number): void {
  p.loc = { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, ts: fix.ts, receivedAt: now };
  delete p.locPending;
}

export function locUpdate(
  state: RoomState,
  playerId: string,
  fix: LocUpdatePayload,
  now: number,
): void {
  const { config } = state;
  const p = findPlayer(state, playerId);
  if (fix.ts > now + config.futureFixToleranceS * MS_PER_S) {
    throw new RuleError('INVALID_PAYLOAD', 'Fix timestamp is in the future');
  }
  if (!p.loc || impliedSpeed(p.loc, fix, config.speedCheckMinDtS) <= config.maxSpeedMps) {
    store(p, fix, now);
    return;
  }
  // Implausible jump: keep the old position, but remember fixes that agree with
  // each other. After `reanchorFixes` of them the player really is somewhere new.
  const last: PendingFix | undefined = p.locPending?.at(-1);
  const consistent = last && impliedSpeed(last, fix, config.speedCheckMinDtS) <= config.maxSpeedMps;
  const run = consistent ? [...(p.locPending ?? [])] : [];
  run.push({ lat: fix.lat, lng: fix.lng, ts: fix.ts });
  if (run.length >= config.reanchorFixes) store(p, fix, now);
  else p.locPending = run;
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
  store(
    findPlayer(state, playerId),
    { lat, lng, accuracy: state.config.teleportAccuracyM, ts: now },
    now,
  );
}

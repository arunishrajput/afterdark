/**
 * Spawn phase (RULES §4, MAP_AND_REGIONS §5): one spawn per player, spread as
 * far apart as possible (never closer than `spawnMinSeparationM`) and assigned
 * so total walking is low. A player has reached theirs when a good fix is within
 * `reachRadiusM`; that is sticky. Pure: seeded RNG, injected `now`.
 */
import {
  createRng,
  distanceM,
  hashSeed,
  type LatLng,
  type Rng,
  sampleBestCandidate,
} from '@afterdark/shared';

import type { PlayerState, RoomState } from '../state';
import type { Effect } from '../types';
import { playableAreaOf } from './layout';
import { fixQuality } from './location';
import { activePlayers } from './players';

const MS_PER_S = 1000;

/** The smallest distance between any two of the points (Infinity for fewer than two). */
function minSeparationM(points: readonly LatLng[]): number {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      best = Math.min(best, distanceM(points[i] as LatLng, points[j] as LatLng));
    }
  }
  return best;
}

/**
 * `count` spawn points in the playable area. It draws `spawnAttempts` layouts
 * (each already spaced ≥ `spawnMinSeparationM` by best-candidate sampling) and
 * keeps the one with the largest minimum distance. `undefined` when the area is
 * too small to fit them (E3).
 */
export function generateSpawns(state: RoomState, count: number, rng: Rng): LatLng[] | undefined {
  const { config } = state;
  const area = playableAreaOf(state);
  let best: LatLng[] | undefined;
  let bestSeparation = -Infinity;
  for (let attempt = 0; attempt < config.spawnAttempts; attempt++) {
    const layout = sampleBestCandidate(area, rng, {
      count,
      minSpacingM: config.spawnMinSeparationM,
    });
    if (layout.length < count) continue;
    const separation = minSeparationM(layout);
    if (separation > bestSeparation) {
      best = layout;
      bestSeparation = separation;
    }
  }
  return best;
}

/** Greedy assignment: repeatedly take the closest (player, spawn) pair. Players without a fix start from the Base. */
export function assignSpawns(
  players: readonly PlayerState[],
  spawns: readonly LatLng[],
  fallback: LatLng,
): Map<string, LatLng> {
  const pairs: { id: string; spawn: number; d: number }[] = [];
  for (const p of players) {
    const from = p.loc ?? fallback;
    spawns.forEach((s, i) => pairs.push({ id: p.id, spawn: i, d: distanceM(from, s) }));
  }
  // Ties break by player order then spawn index, so the result is deterministic.
  pairs.sort((a, b) => a.d - b.d);
  const out = new Map<string, LatLng>();
  const used = new Set<number>();
  for (const pair of pairs) {
    if (out.has(pair.id) || used.has(pair.spawn)) continue;
    out.set(pair.id, spawns[pair.spawn] as LatLng);
    used.add(pair.spawn);
  }
  return out;
}

/**
 * The countdown ended: give everyone a spawn and enter `spawning`. If the area
 * can't fit the spawns (E3) the game does not start: everyone is un-readied and
 * told why, and the host must enlarge the area.
 */
export function beginSpawning(state: RoomState, now: number, effects: Effect[]): void {
  const players = activePlayers(state);
  const rng = createRng(hashSeed(`${state.secretSeed}|spawns`));
  const spawns = generateSpawns(state, players.length, rng);
  const base = state.setup.base;
  if (!spawns || !base) {
    for (const p of state.players) p.ready = false;
    effects.push({ kind: 'event', to: 'all', event: { type: 'lobby.startFailed', reason: 'spawns' } });
    return;
  }
  const assigned = assignSpawns(players, spawns, base);
  for (const p of players) {
    const at = assigned.get(p.id);
    if (at) p.spawn = { lat: at.lat, lng: at.lng, reached: false };
  }
  state.phase = 'spawning';
  state.spawnEndsAt = now + state.config.spawnTimeoutS * MS_PER_S;
  effects.push({ kind: 'event', to: 'all', event: { type: 'game.spawnStarted' } });
}

/** Marks every player whose good fix is within `reachRadiusM` of their spawn as having reached it. */
export function updateSpawnReach(state: RoomState, now: number): void {
  for (const p of activePlayers(state)) {
    if (!p.spawn || p.spawn.reached || !p.loc) continue;
    if (fixQuality(p.loc, now, state.config) !== 'good') continue;
    if (distanceM(p.loc, p.spawn) <= state.config.reachRadiusM) p.spawn.reached = true;
  }
}

/** `reached` of `total` active players, for the "x/y in position" counter. */
export function spawnProgress(state: RoomState): { reached: number; total: number } {
  const players = activePlayers(state);
  return { reached: players.filter((p) => p.spawn?.reached).length, total: players.length };
}

/** Roles start when everyone is in position or the spawn timeout passed (RULES §4.4). */
export function spawnPhaseDone(state: RoomState, now: number): boolean {
  const { reached, total } = spawnProgress(state);
  return reached >= total || (state.spawnEndsAt !== undefined && now >= state.spawnEndsAt);
}

/**
 * Radar: anonymous per-viewer dots (MAP_AND_REGIONS §6). A dot never carries a
 * player id or username; the alias is derived from a secret room salt, the
 * viewer and the target, and rotates every `dotAliasRotateS`, so a dot can't be
 * followed across the whole game or matched between two viewers. Pure.
 *
 * Phase 2 (lobby) shows every other connected, located player, "all"-style,
 * for convenience while gathering. Phase 4 adds the nearby/regions modes and
 * the imposter-only flags.
 */
import { type AnonDot, type DotFlag, hashSeed, pointInRing } from '@afterdark/shared';

import type { RoomState } from '../engine/state';
import { fixQuality } from '../engine/systems/location';

const MS_PER_S = 1000;
const ALIAS_RADIX = 36;
const ALIAS_PART_LEN = 7;

/** 64 bits of salted FNV-1a, in base 36. Not a MAC, but the salt is secret and per room. */
function alias(salt: string, viewerId: string, targetId: string, epoch: number): string {
  const key = `${salt}|${viewerId}|${targetId}|${epoch}`;
  const part = (tag: string) =>
    hashSeed(`${tag}|${key}`).toString(ALIAS_RADIX).padStart(ALIAS_PART_LEN, '0');
  return part('a') + part('b');
}

export function buildRadar(state: RoomState, viewerId: string, now: number): AnonDot[] {
  const epoch = Math.floor(now / (state.config.dotAliasRotateS * MS_PER_S));
  const dots: AnonDot[] = [];
  for (const p of state.players) {
    if (p.id === viewerId || !p.connected || p.left || !p.loc) continue;
    const flags: DotFlag[] = [];
    if (fixQuality(p.loc, now, state.config) === 'stale') flags.push('stale');
    if (state.boundary && !pointInRing(p.loc, state.boundary.ring)) flags.push('oob');
    dots.push({
      alias: alias(state.radarSalt, viewerId, p.id, epoch),
      lat: p.loc.lat,
      lng: p.loc.lng,
      flags,
    });
  }
  return dots.sort((a, b) => (a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : 0));
}

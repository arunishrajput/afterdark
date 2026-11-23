/**
 * Radar: anonymous per-viewer dots (MAP_AND_REGIONS §6). A dot never carries a
 * player id or username; the alias is derived from a secret room salt, the
 * viewer and the target, and rotates every `dotAliasRotateS`, so a dot can't be
 * followed across the whole game or matched between two viewers. Pure.
 *
 * `playerVisibility` decides who appears (ADR-008): `nearby` (within
 * `nearbyRadiusM` of the viewer's own latest fix), `regions` (nobody; region
 * counts only) or `all`. An active imposter's radar also marks the other
 * imposters with `ally`, and exposed or infected crew with `exposed` / `infected` (ROLES.md).
 */
import { type AnonDot, distanceM, type DotFlag, hashSeed } from '@afterdark/shared';

import type { RoomState } from '../engine/state';
import { fixQuality } from '../engine/systems/location';
import { isOutOfBounds } from '../engine/systems/zone';

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
  const { playerVisibility, nearbyRadiusM } = state.config;
  if (playerVisibility === 'regions') return [];
  const viewer = state.players.find((p) => p.id === viewerId);
  const viewerFix = viewer?.loc;
  const viewerIsImposter = viewer?.role === 'imposter' && !viewer.left;
  if (playerVisibility === 'nearby' && !viewerFix) return [];
  const epoch = Math.floor(now / (state.config.dotAliasRotateS * MS_PER_S));
  const dots: AnonDot[] = [];
  for (const p of state.players) {
    if (p.id === viewerId || !p.connected || p.left || !p.loc) continue;
    if (playerVisibility === 'nearby' && viewerFix && distanceM(viewerFix, p.loc) > nearbyRadiusM) {
      continue;
    }
    const flags: DotFlag[] = [];
    if (fixQuality(p.loc, now, state.config) === 'stale') flags.push('stale');
    if (isOutOfBounds(state, p.loc)) flags.push('oob');
    if (viewerIsImposter && p.role === 'imposter') flags.push('ally');
    // Only an imposter learns who is exposed or infected (RULES §7.1.6, ROLES.md).
    if (viewerIsImposter && p.infection) flags.push(p.infection);
    dots.push({
      alias: alias(state.radarSalt, viewerId, p.id, epoch),
      lat: p.loc.lat,
      lng: p.loc.lng,
      flags,
    });
  }
  return dots.sort((a, b) => (a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : 0));
}

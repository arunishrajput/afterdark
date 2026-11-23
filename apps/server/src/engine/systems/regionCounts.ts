/**
 * Region population counts (MAP_AND_REGIONS §6). The server takes a snapshot of
 * which region each active, non-stale player is in every `regionCountRefreshS`.
 * Each viewer then sees bucketed counts (never exact numbers) in which their own
 * current position replaces their snapshot entry, so the count in their own region
 * always includes them and a stale snapshot can't give away who else is there.
 * Pure: `now` is injected.
 */
import { bucketLabel, type RegionCount, sectionOf } from '@afterdark/shared';

import type { PlayerState, RoomState } from '../state';
import { fixQuality } from './location';

const MS_PER_S = 1000;

/** The region a player counts in right now: active, with a fresh fix inside a region. */
function regionOfPlayer(state: RoomState, p: PlayerState, now: number): string | undefined {
  if (p.left || !p.loc || fixQuality(p.loc, now, state.config) === 'stale') return undefined;
  return sectionOf(p.loc, state.setup.regions, state.config.sectionCentreRatio)?.regionId;
}

/** Takes a new snapshot when the last one is older than `regionCountRefreshS` (or missing). */
export function refreshRegionCounts(state: RoomState, now: number): void {
  const last = state.regionCounts;
  if (last && now - last.at < state.config.regionCountRefreshS * MS_PER_S) return;
  const regionOf: Record<string, string> = {};
  for (const p of state.players) {
    const regionId = regionOfPlayer(state, p, now);
    if (regionId) regionOf[p.id] = regionId;
  }
  state.regionCounts = { at: now, regionOf };
}

/** One bucket per region, as the viewer sees them. */
export function projectRegionCounts(
  state: RoomState,
  viewerId: string,
  now: number,
): RegionCount[] {
  const counts = new Map<string, number>(state.setup.regions.map((r) => [r.id, 0]));
  const snapshot = state.regionCounts?.regionOf ?? {};
  for (const regionId of Object.values(snapshot)) {
    if (counts.has(regionId)) counts.set(regionId, (counts.get(regionId) ?? 0) + 1);
  }
  const viewer = state.players.find((p) => p.id === viewerId);
  const was = snapshot[viewerId];
  const is = viewer ? regionOfPlayer(state, viewer, now) : undefined;
  if (was !== is) {
    if (was && counts.has(was)) counts.set(was, (counts.get(was) ?? 0) - 1);
    if (is && counts.has(is)) counts.set(is, (counts.get(is) ?? 0) + 1);
  }
  return state.setup.regions.map((r) => ({
    regionId: r.id,
    bucket: bucketLabel(Math.max(0, counts.get(r.id) ?? 0), state.config.regionCountBuckets),
  }));
}

/**
 * Builds the region layout, the task-point pool and the default Base from the
 * boundary and no-go zones (MAP_AND_REGIONS §2–§4). Deterministic: the seeds live
 * in the state, so the same setup gives the same layout. Pure.
 */
import {
  areaContains,
  createRng,
  distanceM,
  frameRegion,
  generateAutoPoints,
  hashSeed,
  type LatLng,
  mapArea,
  type MultiPolygonCoords,
  partitionRegions,
  planarCentroid,
  planeAt,
  playableArea,
  type RegionSections,
  resolveRegionCount,
  sectionOf,
  sectionShapes,
  type TaskPoint,
} from '@afterdark/shared';

import type { RoomState, SetupRegion } from '../state';

export interface LayoutOptions {
  /** Make new auto points (host points always stay while valid). */
  regeneratePoints: boolean;
  /** Keep the host's region names (only meaningful when the layout seed is unchanged). */
  keepNames: boolean;
}

/** Where things may go: the boundary minus the no-go zones. Empty before a boundary exists. */
export function playableAreaOf(state: RoomState): MultiPolygonCoords {
  return state.boundary ? playableArea(state.boundary.ring, state.setup.noGo) : [];
}

/** The next seed in a deterministic chain, so "regenerate" differs from the last layout. */
export const nextSeed = (state: RoomState, from: number): number =>
  hashSeed(`${state.code}|${from}`);

function centroidOf(region: SetupRegion): LatLng {
  const plane = planeAt(region.origin);
  const [lng, lat] = plane.toLngLat(planarCentroid(mapArea(region.area, plane.toXY)));
  return { lat, lng };
}

/** Centroid of the largest region, snapped to the nearest usable pool point (or the region's origin when there are none). */
function defaultBase(state: RoomState): LatLng | undefined {
  const { regions, taskPoints } = state.setup;
  const largest = [...regions].sort((a, b) => b.areaM2 - a.areaM2)[0];
  if (!largest) return undefined;
  const centre = centroidOf(largest);
  const candidates = taskPoints.filter((p) => !p.disabled);
  let best: LatLng | undefined;
  let bestD = Infinity;
  for (const p of candidates) {
    const d = distanceM(centre, p);
    if (d < bestD) {
      best = { lat: p.lat, lng: p.lng };
      bestD = d;
    }
  }
  return best ?? largest.origin;
}

/** Recomputes regions, points and Base from the boundary, no-go zones and seeds in `state.setup`. */
export function applyLayout(state: RoomState, opts: LayoutOptions): void {
  const { setup, config } = state;
  delete state.regionCounts; // region ids may change: recount at the next tick
  if (!state.boundary) {
    setup.regions = [];
    setup.taskPoints = [];
    delete setup.base;
    setup.baseIsDefault = true;
    return;
  }
  const domain = playableAreaOf(state);
  const inside = areaContains(domain);
  const k = resolveRegionCount(
    config.regionCount,
    state.boundary.areaM2,
    config.regionCountAutoMaxAreaM2,
  );
  const oldNames = new Map(setup.regions.map((r) => [r.id, r.name]));
  const keepNames = opts.keepNames && oldNames.size > 0;

  const sections: RegionSections[] = [];
  setup.regions = partitionRegions(domain, k, setup.seed, config).map((shape) => {
    const region = frameRegion({
      ...shape,
      name: keepNames ? (oldNames.get(shape.id) ?? shape.name) : shape.name,
    });
    const shapes = sectionShapes(region, config.sectionCentreRatio);
    sections.push({ region, shapes });
    return { ...region, sections: shapes.map((s) => ({ id: s.id, areaM2: s.areaM2 })) };
  });

  // Re-locate surviving points in the new layout; anything now outside it is dropped.
  const survivors: TaskPoint[] = [];
  for (const p of setup.taskPoints) {
    if (opts.regeneratePoints && p.source === 'auto') continue;
    const place = inside(p) ? sectionOf(p, setup.regions, config.sectionCentreRatio) : null;
    if (place) survivors.push({ ...p, ...place });
  }
  const fresh = opts.regeneratePoints
    ? generateAutoPoints(
        sections,
        createRng(setup.poolSeed),
        config,
        survivors,
        () => `p${setup.nextPointNo++}`,
      )
    : [];
  setup.taskPoints = [...survivors, ...fresh];

  const keepBase = !setup.baseIsDefault && setup.base !== undefined && inside(setup.base);
  if (!keepBase) {
    const base = defaultBase(state);
    if (base) setup.base = base;
    else delete setup.base;
    setup.baseIsDefault = true;
  }
}

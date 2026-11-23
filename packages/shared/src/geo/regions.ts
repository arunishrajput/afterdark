/**
 * Region partition (MAP_AND_REGIONS §2): k-means on random points of the playable
 * area, a Voronoi diagram of the centroids, each cell clipped to the area, parts
 * cut off from their cell merged into a neighbour, and the whole thing re-run with
 * one region fewer when a region comes out too small. Deterministic per seed.
 */
import { featureCollection, point } from '@turf/helpers';
import turfVoronoi from '@turf/voronoi';

import type { GameConfig } from '../config/schema';
import { createRng, type Rng } from '../rng';
import {
  differenceAreas,
  intersectAreas,
  mapArea,
  planarArea,
  planarCentroid,
  planeAt,
  unionAreas,
} from './plane';
import { areaBBox, areaContains, sampleUniform } from './sampling';
import type { LatLng, MultiPolygonCoords, Position, Ring } from './types';

/** Fewest regions the game plays with (CONFIG `regionCount`: 2–6). */
export const MIN_REGIONS = 2;
/** Voronoi cells extend this far (m) beyond the area so they cover its whole edge. */
const VORONOI_MARGIN_M = 50;
/** A clipped part smaller than this (m²) is numerical dust, not a region part. */
const MIN_PART_AREA_M2 = 1;
/** A cut-off part shares an edge with a neighbour where it lies within this distance (m). */
const SHARED_EDGE_TOLERANCE_M = 0.5;
/** Spacing (m) of the samples along a part's outline when measuring a shared edge. */
const SHARED_EDGE_STEP_M = 2;
/** Coordinate precision of region polygons (1e-7° ≈ 1 cm). */
const COORD_DECIMALS = 7;

export interface RegionShape {
  id: string;
  name: string;
  /** In `[lng, lat]`. Usually one polygon; several when a no-go zone cuts the region apart. */
  area: MultiPolygonCoords;
  areaM2: number;
}

export type RegionConfig = Pick<
  GameConfig,
  'regionSampleCount' | 'regionKmeansIterations' | 'minRegionAreaRatio'
>;

/** `auto`: 2 + the number of `thresholds` the area meets or exceeds (CONFIG `regionCountAutoMaxAreaM2`). */
export function resolveRegionCount(
  setting: 'auto' | number,
  boundaryAreaM2: number,
  thresholds: readonly number[],
): number {
  if (setting !== 'auto') return setting;
  return MIN_REGIONS + thresholds.filter((t) => boundaryAreaM2 >= t).length;
}

/** The boundary minus the no-go zones: where regions, points and the Base may go. */
export function playableArea(boundary: Ring, noGo: readonly Ring[]): MultiPolygonCoords {
  const outer: MultiPolygonCoords = [[boundary]];
  if (noGo.length === 0) return outer;
  const zones = noGo.reduce<MultiPolygonCoords>((acc, ring) => unionAreas(acc, [[ring]]), []);
  return differenceAreas(outer, zones);
}

const sq = (n: number) => n * n;
const dist2 = (a: Position, b: Position) => sq(a[0] - b[0]) + sq(a[1] - b[1]);

/** k-means++ seeding followed by Lloyd iterations. */
function kmeans(points: readonly Position[], k: number, iterations: number, rng: Rng): Position[] {
  const centres: Position[] = [rng.pick(points)];
  while (centres.length < k) {
    const weights = points.map((p) => Math.min(...centres.map((c) => dist2(p, c))));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total === 0) break;
    let r = rng.next() * total;
    let chosen = points.length - 1;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i] as number;
      if (r <= 0) {
        chosen = i;
        break;
      }
    }
    centres.push(points[chosen] as Position);
  }
  for (let iter = 0; iter < iterations; iter++) {
    const sums = centres.map(() => ({ x: 0, y: 0, n: 0 }));
    for (const p of points) {
      let best = 0;
      let bestD = Infinity;
      centres.forEach((c, i) => {
        const d = dist2(p, c);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      const s = sums[best] as { x: number; y: number; n: number };
      s.x += p[0];
      s.y += p[1];
      s.n += 1;
    }
    sums.forEach((s, i) => {
      if (s.n > 0) centres[i] = [s.x / s.n, s.y / s.n];
    });
  }
  return centres;
}

/** Distance from `p` to the nearest edge of any ring of `area`. */
function distanceToEdges(p: Position, area: MultiPolygonCoords): number {
  let best = Infinity;
  for (const poly of area) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i] as Position;
        const b = ring[i + 1] as Position;
        const abx = b[0] - a[0];
        const aby = b[1] - a[1];
        const len2 = sq(abx) + sq(aby);
        const t =
          len2 === 0
            ? 0
            : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2));
        best = Math.min(best, Math.sqrt(dist2(p, [a[0] + t * abx, a[1] + t * aby])));
      }
    }
  }
  return best;
}

/** Length (m) of `part`'s outer outline that lies along `other`'s edges. */
function sharedEdgeLength(part: MultiPolygonCoords[number], other: MultiPolygonCoords): number {
  const outline = part[0] ?? [];
  let shared = 0;
  for (let i = 0; i < outline.length - 1; i++) {
    const a = outline[i] as Position;
    const b = outline[i + 1] as Position;
    const len = Math.sqrt(dist2(a, b));
    const steps = Math.max(1, Math.ceil(len / SHARED_EDGE_STEP_M));
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      const mid: Position = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      if (distanceToEdges(mid, other) <= SHARED_EDGE_TOLERANCE_M) shared += len / steps;
    }
  }
  return shared;
}

/** Clips every Voronoi cell to the area and gives each cell's cut-off parts to the neighbour they border most. */
function clipAndMerge(
  cells: readonly MultiPolygonCoords[],
  domain: MultiPolygonCoords,
): MultiPolygonCoords[] {
  const regions = cells.map((cell) =>
    intersectAreas(cell, domain).filter((p) => planarArea([p]) >= MIN_PART_AREA_M2),
  );
  regions.forEach((parts, i) => {
    if (parts.length < 2) return;
    const sorted = [...parts].sort((a, b) => planarArea([b]) - planarArea([a]));
    const [main, ...orphans] = sorted as [MultiPolygonCoords[number], ...MultiPolygonCoords];
    regions[i] = [main];
    for (const orphan of orphans) {
      let target = i;
      let bestShared = 0;
      regions.forEach((other, j) => {
        if (j === i) return;
        const shared = sharedEdgeLength(orphan, other);
        if (shared > bestShared) {
          bestShared = shared;
          target = j;
        }
      });
      regions[target] = unionAreas(regions[target] ?? [], [orphan]);
    }
  });
  return regions;
}

const round = (n: number) => Number(n.toFixed(COORD_DECIMALS));
const roundPos = ([x, y]: Position): Position => [round(x), round(y)];

const letter = (index: number) => String.fromCharCode('A'.charCodeAt(0) + index);

function voronoiCells(
  centres: readonly Position[],
  domain: MultiPolygonCoords,
): MultiPolygonCoords[] {
  const [minX, minY, maxX, maxY] = areaBBox(domain);
  const diagram = turfVoronoi(featureCollection(centres.map((c) => point(c))), {
    bbox: [
      minX - VORONOI_MARGIN_M,
      minY - VORONOI_MARGIN_M,
      maxX + VORONOI_MARGIN_M,
      maxY + VORONOI_MARGIN_M,
    ],
  });
  // Pair each cell with the centre it encloses rather than trusting the library's order.
  return centres.map((c) => {
    const cell = diagram.features.find((f) =>
      areaContains([f.geometry.coordinates as Ring[]])({ lng: c[0], lat: c[1] }),
    );
    return cell ? [cell.geometry.coordinates as Ring[]] : [];
  });
}

/**
 * Splits the playable `domain` (in `[lng, lat]`) into `k` regions. The result may have fewer
 * than `k` regions when a region would be tiny; it never has fewer than `MIN_REGIONS` unless the
 * area itself can't hold them. Named `Region A`, `Region B`… from west to east, then north to south.
 */
export function partitionRegions(
  domain: MultiPolygonCoords,
  k: number,
  seed: number,
  config: RegionConfig,
): RegionShape[] {
  const [minLng, minLat, maxLng, maxLat] = areaBBox(domain);
  const origin: LatLng = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  const plane = planeAt(origin);
  const domainXY = mapArea(domain, plane.toXY);

  for (let count = Math.max(MIN_REGIONS, k); ; count--) {
    const rng = createRng(seed);
    const samples = sampleUniform(domain, rng, config.regionSampleCount).map((p) =>
      plane.toXY([p.lng, p.lat]),
    );
    if (samples.length < count) return [];
    const centres = kmeans(samples, count, config.regionKmeansIterations, rng);
    const areas = clipAndMerge(voronoiCells(centres, domainXY), domainXY).filter(
      (a) => a.length > 0,
    );
    const sizes = areas.map((a) => planarArea(a));
    const average = sizes.reduce((a, b) => a + b, 0) / Math.max(1, sizes.length);
    const tooSmall = sizes.some((s) => s < config.minRegionAreaRatio * average);
    if (tooSmall && count > MIN_REGIONS) continue;

    const ordered = areas
      .map((area, i) => ({ area, areaM2: sizes[i] as number, c: planarCentroid(area) }))
      .sort((a, b) => a.c[0] - b.c[0] || b.c[1] - a.c[1]);
    return ordered.map((r, i) => ({
      id: `r${i + 1}`,
      name: `Region ${letter(i)}`,
      area: mapArea(r.area, (p) => roundPos(plane.toLngLat(p))),
      areaM2: r.areaM2,
    }));
  }
}

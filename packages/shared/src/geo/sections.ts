/**
 * The 9-section local compass (MAP_AND_REGIONS §3). Every region has its own
 * origin (its pole of inaccessibility) and radius ρ, so "North-East of Region A"
 * is measured from Region A, never from the whole map.
 */
import { createRng } from '../rng';
import { bearingDeg, distanceM } from './distance';
import {
  differenceAreas,
  intersectAreas,
  mapArea,
  planarArea,
  planarCentroid,
  planeAt,
} from './plane';
import { polylabel } from './polylabel';
import type { RegionShape } from './regions';
import { areaBBox, areaContains, sampleUniform } from './sampling';
import type { LatLng, MultiPolygonCoords, Position, Ring } from './types';

export const COMPASS_SECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type CompassSection = (typeof COMPASS_SECTIONS)[number];
/** `C` is the Centre section: the inner part of the region around its origin. */
export const SECTION_IDS = [...COMPASS_SECTIONS, 'C'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

const FULL_TURN = 360;
const SECTION_ARC_DEG = FULL_TURN / COMPASS_SECTIONS.length;
const HALF_ARC_DEG = SECTION_ARC_DEG / 2;
const DEG_TO_RAD = Math.PI / 180;
/** Precision (m) of the pole-of-inaccessibility search. */
const POLE_PRECISION_M = 0.5;
/** Wedges reach this many radii out: far enough that their chord clears the region. */
const WEDGE_REACH = 2;
const DISC_STEPS = 64;

/** A region with its compass frame. */
export interface Region extends RegionShape {
  /** Pole of inaccessibility: the interior point furthest from the region's edge. */
  origin: LatLng;
  /** ρ: distance from the origin to the region's furthest vertex, in metres. */
  rhoM: number;
}

export interface SectionPlace {
  regionId: string;
  section: SectionId;
}

/** Compass section for a bearing in degrees clockwise from true north. Borders belong to the section on their clockwise side. */
export function compassSectionOf(bearing: number): CompassSection {
  const turn = ((bearing % FULL_TURN) + FULL_TURN) % FULL_TURN;
  const index = Math.floor(((turn + HALF_ARC_DEG) % FULL_TURN) / SECTION_ARC_DEG);
  return COMPASS_SECTIONS[index] as CompassSection;
}

/** The section of `point` in a region frame, assuming the point is inside the region. */
export function sectionInFrame(
  point: LatLng,
  frame: Pick<Region, 'origin' | 'rhoM'>,
  centreRatio: number,
): SectionId {
  if (distanceM(frame.origin, point) <= centreRatio * frame.rhoM) return 'C';
  return compassSectionOf(bearingDeg(frame.origin, point));
}

/**
 * Which region and section a point is in, or `null` outside every region. A point
 * on a border shared by two regions belongs to the earlier region in the list.
 */
export function sectionOf(
  point: LatLng,
  regions: readonly Region[],
  centreRatio: number,
): SectionPlace | null {
  for (const region of regions) {
    if (areaContains(region.area)(point)) {
      return { regionId: region.id, section: sectionInFrame(point, region, centreRatio) };
    }
  }
  return null;
}

function eachVertex(area: MultiPolygonCoords, f: (p: Position) => void): void {
  for (const poly of area) for (const ring of poly) for (const p of ring) f(p);
}

/** Origin by pole of inaccessibility, falling back to the centroid, then to any interior point. */
function findOrigin(area: MultiPolygonCoords, plane: ReturnType<typeof planeAt>): LatLng {
  const inside = areaContains(area);
  const toLatLng = (p: Position): LatLng => {
    const [lng, lat] = plane.toLngLat(p);
    return { lat, lng };
  };
  const planar = mapArea(area, plane.toXY);
  let best: { p: Position; d: number } | undefined;
  for (const poly of planar) {
    const p = polylabel(poly, POLE_PRECISION_M);
    if (!best || p.distance > best.d) best = { p: [p[0], p[1]], d: p.distance };
  }
  if (best && best.d > 0 && inside(toLatLng(best.p))) return toLatLng(best.p);
  const centroid = toLatLng(planarCentroid(planar));
  if (inside(centroid)) return centroid;
  const any = sampleUniform(area, createRng(0), 1)[0];
  if (any) return any;
  const [lng, lat] = area[0]?.[0]?.[0] ?? [0, 0];
  return { lat, lng };
}

/** Adds the compass frame (origin and ρ) to a region shape. */
export function frameRegion(shape: RegionShape): Region {
  const [minLng, minLat, maxLng, maxLat] = areaBBox(shape.area);
  const plane = planeAt({ lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 });
  const origin = findOrigin(shape.area, plane);
  let rhoM = 0;
  eachVertex(shape.area, ([lng, lat]) => {
    rhoM = Math.max(rhoM, distanceM(origin, { lat, lng }));
  });
  return { ...shape, origin, rhoM };
}

const asRing = (points: Position[]): Ring => [...points, points[0] as Position];

function discPlanar(radius: number): MultiPolygonCoords {
  const pts: Position[] = [];
  for (let i = 0; i < DISC_STEPS; i++) {
    const a = (i / DISC_STEPS) * FULL_TURN * DEG_TO_RAD;
    pts.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return [[asRing(pts)]];
}

/** A wedge (planar, origin at 0,0) around compass bearing `centre`, reaching `reach` metres. */
function wedgePlanar(centre: number, reach: number): MultiPolygonCoords {
  const at = (bearing: number): Position => [
    reach * Math.sin(bearing * DEG_TO_RAD),
    reach * Math.cos(bearing * DEG_TO_RAD),
  ];
  return [[asRing([[0, 0], at(centre - HALF_ARC_DEG), at(centre), at(centre + HALF_ARC_DEG)])]];
}

export interface SectionShape {
  id: SectionId;
  area: MultiPolygonCoords;
  areaM2: number;
}

/**
 * The 9 section polygons of a region (compass wedges intersected with the region, minus the
 * centre disc, plus the disc itself). Used for map highlights and area checks. Sections the
 * region doesn't reach come back empty with an area of 0.
 */
export function sectionShapes(region: Region, centreRatio: number): SectionShape[] {
  const plane = planeAt(region.origin);
  const regionXY = mapArea(region.area, plane.toXY);
  const disc = discPlanar(centreRatio * region.rhoM);
  const reach = WEDGE_REACH * region.rhoM;
  const shapes = SECTION_IDS.map((id): SectionShape => {
    const index = COMPASS_SECTIONS.indexOf(id as CompassSection);
    const planar =
      id === 'C'
        ? intersectAreas(regionXY, disc)
        : differenceAreas(
            intersectAreas(regionXY, wedgePlanar(index * SECTION_ARC_DEG, reach)),
            disc,
          );
    return {
      id,
      area: mapArea(planar, plane.toLngLat),
      areaM2: planarArea(planar),
    };
  });
  return shapes;
}

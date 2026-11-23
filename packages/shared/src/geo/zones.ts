/** No-go zones: the host draws polygons for roads, water and private property (MAP_AND_REGIONS §1.4). */
import { polygon as turfPolygon } from '@turf/helpers';
import turfKinks from '@turf/kinks';

import { distinctVertices } from './boundary';
import type { Position, Ring } from './types';

const MIN_CORNERS = 3;

export type ZoneResult = { ok: true; ring: Ring } | { ok: false; message: string };

/** A zone must be one simple polygon with at least 3 corners. `label` names it in the message, e.g. "No-go zone 2". */
export function validateNoGoZone(coords: readonly Position[], label: string): ZoneResult {
  const vertices = distinctVertices([...coords]);
  if (vertices.length < MIN_CORNERS) {
    return { ok: false, message: `${label} needs at least ${MIN_CORNERS} corners.` };
  }
  const ring: Ring = [...vertices, vertices[0] as Position];
  if (turfKinks(turfPolygon([ring])).features.length > 0) {
    return { ok: false, message: `${label} crosses itself. Redraw it as one simple shape.` };
  }
  return { ok: true, ring };
}

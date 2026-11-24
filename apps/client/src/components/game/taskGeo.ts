/** Where a task card points: label, target and the direction arrow (UI_UX §3). Pure. */
import {
  bearingDeg,
  DEFAULT_CONFIG,
  distanceM,
  type LatLng,
  type RegionPublic,
  type SectionId,
  sectionShapes,
  type TaskCard,
} from '@afterdark/shared';

const FULL_TURN = 360;

/** "NE · Region A" (UI_UX §3). The centre section reads "Centre". */
export function cardLabel(card: Pick<TaskCard, 'section' | 'regionName'>): string {
  const section = card.section === 'C' ? 'Centre' : card.section;
  return `${section} · ${card.regionName}`;
}

/** "Find GHOST-03 · NE · Region B" for a co-op card, "NE · Region B" otherwise (UI_UX §3). */
export function labelOf(
  card: Pick<TaskCard, 'kind' | 'partnerTag' | 'section' | 'regionName'>,
): string {
  return card.kind === 'coop' && card.partnerTag
    ? `Find ${card.partnerTag} · ${cardLabel(card)}`
    : cardLabel(card);
}

/** The middle of a section's largest polygon (its first ring's vertex average): enough to point an arrow at. */
export function sectionAnchor(region: RegionPublic, section: SectionId): LatLng | undefined {
  const shape = sectionShapes(region, DEFAULT_CONFIG.sectionCentreRatio).find(
    (s) => s.id === section,
  );
  const ring = shape?.area[0]?.[0];
  if (!ring || ring.length < 2) return undefined;
  const corners = ring.slice(0, -1);
  const lng = corners.reduce((sum, p) => sum + p[0], 0) / corners.length;
  const lat = corners.reduce((sum, p) => sum + p[1], 0) / corners.length;
  return { lat, lng };
}

export interface Guidance {
  /** Metres to the target. */
  distanceM: number;
  /** Degrees clockwise from true north. */
  bearing: number;
  /** Degrees to rotate an "up" arrow so it points the way, given the device heading (map-north when unknown). */
  arrowDeg: number;
}

/** Distance and arrow from the player to a target; `heading` is the device heading in degrees, if known. */
export function guidance(from: LatLng, to: LatLng, heading?: number): Guidance {
  const bearing = (bearingDeg(from, to) + FULL_TURN) % FULL_TURN;
  const arrowDeg = (bearing - (heading ?? 0) + FULL_TURN) % FULL_TURN;
  return { distanceM: distanceM(from, to), bearing, arrowDeg };
}

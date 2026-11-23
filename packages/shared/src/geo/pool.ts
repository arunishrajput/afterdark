/**
 * The task-point pool (MAP_AND_REGIONS §4): candidate spots for tasks, generated
 * per usable section. Pure and seeded; the server stores the result in the room
 * state and the host can edit it.
 */
import type { GameConfig } from '../config/schema';
import type { Rng } from '../rng';
import { sampleBestCandidate } from './sampling';
import { type Region, type SectionId, sectionInFrame, type SectionShape } from './sections';
import type { LatLng } from './types';

export type TaskPointSource = 'auto' | 'host';

export interface TaskPoint {
  id: string;
  lat: number;
  lng: number;
  regionId: string;
  section: SectionId;
  source: TaskPointSource;
  /** Switched off for the rest of the game when reported unsafe (Phase 5). */
  disabled: boolean;
}

export type PoolConfig = Pick<
  GameConfig,
  'taskPointsPerSection' | 'taskPointMinSpacingM' | 'minSectionAreaM2' | 'sectionCentreRatio'
>;

export interface RegionSections {
  region: Region;
  shapes: readonly SectionShape[];
}

/** A section is big enough for tasks (MAP_AND_REGIONS §3). */
export const sectionBigEnough = (areaM2: number, config: Pick<PoolConfig, 'minSectionAreaM2'>) =>
  areaM2 >= config.minSectionAreaM2;

/**
 * Samples up to `taskPointsPerSection` points in every section of at least
 * `minSectionAreaM2`, at least `taskPointMinSpacingM` from each other and from the
 * `keep` points (host points that survive a regeneration). A section's point carries
 * the section the server's own `sectionInFrame` assigns it, which is the one that counts.
 */
export function generateAutoPoints(
  sections: readonly RegionSections[],
  rng: Rng,
  config: PoolConfig,
  keep: readonly TaskPoint[],
  nextId: () => string,
): TaskPoint[] {
  const placed: LatLng[] = keep.map((p) => ({ lat: p.lat, lng: p.lng }));
  const out: TaskPoint[] = [];
  for (const { region, shapes } of sections) {
    for (const shape of shapes) {
      if (!sectionBigEnough(shape.areaM2, config)) continue;
      const picked = sampleBestCandidate(shape.area, rng, {
        count: config.taskPointsPerSection,
        minSpacingM: config.taskPointMinSpacingM,
        existing: placed,
      });
      for (const p of picked) {
        placed.push(p);
        out.push({
          id: nextId(),
          lat: p.lat,
          lng: p.lng,
          regionId: region.id,
          section: sectionInFrame(p, region, config.sectionCentreRatio),
          source: 'auto',
          disabled: false,
        });
      }
    }
  }
  return out;
}

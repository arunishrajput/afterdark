/**
 * Setup validation (MAP_AND_REGIONS §1.6, RULES E39): what is still missing or
 * invalid before a game can start. Shared so the server decides and the client's
 * checklist shows the same reasons.
 */
import type { GameConfig } from '../config/schema';

export type SetupIssue = 'boundaryMissing' | 'baseMissing' | 'tooFewPoints' | 'tooFewRegions';

/** The numbers `validateSetup` needs, derived by `summarizeSetup`. */
export interface SetupSummary {
  boundarySet: boolean;
  baseSet: boolean;
  /** Enabled points lying in sections big enough for tasks. */
  usablePoints: number;
  /** Distinct regions holding at least one usable point. */
  regionsWithPoints: number;
}

interface SummaryInput {
  boundary?: unknown;
  base?: unknown;
  regions?: readonly { id: string; sections: readonly { id: string; areaM2: number }[] }[];
  points?: readonly { regionId: string; section: string; disabled?: boolean }[];
}

export function summarizeSetup(
  map: SummaryInput,
  config: Pick<GameConfig, 'minSectionAreaM2'>,
): SetupSummary {
  const bigSections = new Set<string>();
  for (const r of map.regions ?? []) {
    for (const s of r.sections) {
      if (s.areaM2 >= config.minSectionAreaM2) bigSections.add(`${r.id}:${s.id}`);
    }
  }
  const usable = (map.points ?? []).filter(
    (p) => !p.disabled && bigSections.has(`${p.regionId}:${p.section}`),
  );
  return {
    boundarySet: map.boundary !== undefined,
    baseSet: map.base !== undefined,
    usablePoints: usable.length,
    regionsWithPoints: new Set(usable.map((p) => p.regionId)).size,
  };
}

/** How many usable points `playerCount` players need. */
export const pointsNeeded = (
  config: Pick<GameConfig, 'minTaskPointsPerPlayer'>,
  playerCount: number,
) => config.minTaskPointsPerPlayer * playerCount;

export function validateSetup(
  config: Pick<GameConfig, 'minTaskPointsPerPlayer' | 'minRegionsWithPoints'>,
  playerCount: number,
  summary: SetupSummary,
): SetupIssue[] {
  const issues: SetupIssue[] = [];
  if (!summary.boundarySet) issues.push('boundaryMissing');
  if (!summary.baseSet) issues.push('baseMissing');
  if (summary.boundarySet) {
    if (summary.usablePoints < pointsNeeded(config, playerCount)) issues.push('tooFewPoints');
    if (summary.regionsWithPoints < config.minRegionsWithPoints) issues.push('tooFewRegions');
  }
  return issues;
}

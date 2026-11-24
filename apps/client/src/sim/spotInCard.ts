/**
 * Test hook (e2e): a spot inside one of the viewer's task cards' sections, checked with the
 * server's own rule (`pointInSection`, as the bots use); the drawn wedge and the rule can disagree
 * by a sliver at a border (ADR-044). Loaded on demand so the geometry stays out of the entry chunk.
 */
import { createRng, DEFAULT_CONFIG, type LatLng, pointInSection } from '@afterdark/shared';

import { useGame } from '../store';

export function spotInCard(index: number): LatLng | undefined {
  const v = useGame.getState().view;
  const card = v?.game?.tasks?.[index];
  if (!v || !card) return undefined;
  return pointInSection(
    v.lobby.map.regions,
    card,
    DEFAULT_CONFIG.sectionCentreRatio,
    createRng(index + 1),
  );
}

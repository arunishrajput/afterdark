/**
 * The one imposter-only cue while disguised (UI_UX §2): a hairline along the very top edge that
 * shrinks as the disguise runs out. Muted white, no red, so it reads as a browser progress line.
 */
import { type CamouflageView, DEFAULT_CONFIG } from '@afterdark/shared';

import { disguiseFraction } from './disguise';

const MS_PER_S = 1000;
const PERCENT = 100;

export function DisguiseCue({ disguise, now }: { disguise: CamouflageView; now: number }) {
  // The disguise can run past its base length while a co-op lasts; the line then simply stays full.
  const fraction = disguiseFraction(disguise, now, DEFAULT_CONFIG.camouflageDurationS * MS_PER_S);
  return (
    <div
      aria-hidden="true"
      data-testid="disguise-cue"
      className="pointer-events-none fixed top-0 left-0 z-[2000] h-0.5 bg-white/40"
      style={{ width: `${fraction * PERCENT}%` }}
    />
  );
}

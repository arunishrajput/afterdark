/** Region-count buckets (CONFIG `regionCountBuckets`): a count gets the label of the last bucket whose `min` it reaches. */
import type { GameConfig } from '../config/schema';

export function bucketLabel(count: number, buckets: GameConfig['regionCountBuckets']): string {
  let label = buckets[0]?.label ?? String(count);
  let best = -Infinity;
  for (const b of buckets) {
    if (count >= b.min && b.min >= best) {
      label = b.label;
      best = b.min;
    }
  }
  return label;
}

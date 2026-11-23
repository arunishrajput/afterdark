import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import { bucketLabel } from './buckets';

describe('bucketLabel', () => {
  it('maps counts to 0, 1, 2–3 and 4+', () => {
    const labels = [0, 1, 2, 3, 4, 5, 12].map((n) =>
      bucketLabel(n, DEFAULT_CONFIG.regionCountBuckets),
    );
    expect(labels).toEqual(['0', '1', '2–3', '2–3', '4+', '4+', '4+']);
  });

  it('does not depend on the order of the buckets', () => {
    const shuffled = [...DEFAULT_CONFIG.regionCountBuckets].reverse();
    expect(bucketLabel(3, shuffled)).toBe('2–3');
  });
});

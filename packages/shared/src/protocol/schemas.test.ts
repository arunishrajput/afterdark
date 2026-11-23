import { describe, expect, it } from 'vitest';

import { timePingSchema } from './schemas';

describe('timePingSchema', () => {
  it('accepts a numeric clientTs', () => {
    expect(timePingSchema.parse({ clientTs: 123 })).toEqual({ clientTs: 123 });
  });

  it('rejects missing, non-numeric, non-finite or extra fields', () => {
    expect(timePingSchema.safeParse({}).success).toBe(false);
    expect(timePingSchema.safeParse({ clientTs: '1' }).success).toBe(false);
    expect(timePingSchema.safeParse({ clientTs: Infinity }).success).toBe(false);
    expect(timePingSchema.safeParse({ clientTs: 1, x: 2 }).success).toBe(false);
  });
});

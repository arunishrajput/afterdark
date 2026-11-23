import { describe, expect, it } from 'vitest';

import { createRateLimiter } from './rateLimit';

describe('createRateLimiter', () => {
  it('allows max events per rolling window, then refuses until the window moves', () => {
    let t = 0;
    const limiter = createRateLimiter(3, { windowMs: 1000, now: () => t });
    expect([limiter.allow(), limiter.allow(), limiter.allow(), limiter.allow()]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    t = 999;
    expect(limiter.allow()).toBe(false);
    t = 1000; // the first three fall out of the window
    expect(limiter.allow()).toBe(true);
  });
});

/**
 * Basic per-socket rate limit (PROTOCOL › Conventions): at most `max` events
 * in any rolling `windowMs`. Transport-level, so it uses a monotonic wall clock
 * rather than the (possibly faked) game clock.
 */
const DEFAULT_WINDOW_MS = 1000;

export interface RateLimiter {
  /** Records an event; false when it is over the limit (the event is not counted). */
  allow(): boolean;
}

export function createRateLimiter(
  max: number,
  opts: { windowMs?: number; now?: () => number } = {},
): RateLimiter {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const now = opts.now ?? (() => performance.now());
  const stamps: number[] = [];
  return {
    allow() {
      const t = now();
      while (stamps.length > 0 && (stamps[0] ?? 0) <= t - windowMs) stamps.shift();
      if (stamps.length >= max) return false;
      stamps.push(t);
      return true;
    },
  };
}

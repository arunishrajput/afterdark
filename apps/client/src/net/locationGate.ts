/** When may the client send a fix? (ARCHITECTURE §5, CONFIG: location send keys.) Pure. */
import { distanceM, type LatLng } from '@afterdark/shared';

export interface GateConfig {
  /** Send at this rate while moving. */
  sendIntervalMs: number;
  /** Under this much net movement over the window, the player is stationary. */
  minMoveM: number;
  /** A stationary player sends this often (battery saver), and never less often, so the server doesn't see them as stale. */
  heartbeatMs: number;
  /** Look-back for "stationary". */
  windowMs: number;
}

export interface LastSend extends LatLng {
  at: number;
}

/** One position the tracker has seen: when (device `Date.now()`) and where. */
export interface Sample extends LatLng {
  at: number;
}

/**
 * Remembers the last `windowMs` of fixes. Until it holds a full window it
 * cannot tell, and says "moving" (a fresh start sends at the fast rate).
 */
export class MotionTracker {
  private samples: Sample[] = [];

  constructor(private readonly cfg: Pick<GateConfig, 'minMoveM' | 'windowMs'>) {}

  observe(fix: LatLng, now: number): void {
    this.samples.push({ lat: fix.lat, lng: fix.lng, at: now });
    // Keep one sample at or before the window's start, to compare against.
    const start = now - this.cfg.windowMs;
    while (this.samples.length > 1 && (this.samples[1]?.at ?? Infinity) <= start)
      this.samples.shift();
  }

  reset(): void {
    this.samples = [];
  }

  isStationary(now: number): boolean {
    const first = this.samples[0];
    const latest = this.samples[this.samples.length - 1];
    if (!first || !latest) return false;
    if (now - first.at < this.cfg.windowMs) return false; // not enough history yet
    return distanceM(first, latest) < this.cfg.minMoveM;
  }
}

export function shouldSend(
  last: LastSend | undefined,
  now: number,
  stationary: boolean,
  cfg: Pick<GateConfig, 'sendIntervalMs' | 'heartbeatMs'>,
): boolean {
  if (!last) return true;
  return now - last.at >= (stationary ? cfg.heartbeatMs : cfg.sendIntervalMs);
}

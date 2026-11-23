/** When may the client send a fix? (ARCHITECTURE §5, CONFIG: location send keys.) Pure. */
import { distanceM, type LatLng } from '@afterdark/shared';

export interface GateConfig {
  /** Most frequent send rate. */
  sendIntervalMs: number;
  /** Send sooner than the heartbeat once the player has moved this far. */
  minMoveM: number;
  /** Send at least this often, so the server doesn't see a quiet player as stale. */
  heartbeatMs: number;
}

export interface LastSend extends LatLng {
  at: number;
}

export function shouldSend(
  last: LastSend | undefined,
  now: number,
  fix: LatLng,
  cfg: GateConfig,
): boolean {
  if (!last) return true;
  const since = now - last.at;
  if (since >= cfg.heartbeatMs) return true;
  if (since < cfg.sendIntervalMs) return false;
  return distanceM(last, fix) >= cfg.minMoveM;
}

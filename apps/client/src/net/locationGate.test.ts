import { DEFAULT_CONFIG, offsetByMeters } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { type GateConfig, shouldSend } from './locationGate';

const cfg: GateConfig = {
  sendIntervalMs: DEFAULT_CONFIG.locationSendIntervalMs,
  minMoveM: DEFAULT_CONFIG.locationMinMoveM,
  heartbeatMs: DEFAULT_CONFIG.stationarySendIntervalMs,
};
const HOME = { lat: 28.6139, lng: 77.209 };
const last = { ...HOME, at: 10_000 };

describe('shouldSend', () => {
  it('always sends the first fix', () => {
    expect(shouldSend(undefined, 0, HOME, cfg)).toBe(true);
  });

  it('never sends faster than sendIntervalMs, even after a big move', () => {
    const far = offsetByMeters(HOME, 50, 0);
    expect(shouldSend(last, last.at + cfg.sendIntervalMs - 1, far, cfg)).toBe(false);
  });

  it('sends once the interval has passed and the player moved locationMinMoveM', () => {
    const moved = offsetByMeters(HOME, cfg.minMoveM + 0.5, 0);
    expect(shouldSend(last, last.at + cfg.sendIntervalMs, moved, cfg)).toBe(true);
  });

  it('holds back a barely-moved fix until the heartbeat', () => {
    const jitter = offsetByMeters(HOME, 1, 0);
    expect(shouldSend(last, last.at + cfg.sendIntervalMs + 500, jitter, cfg)).toBe(false);
    expect(shouldSend(last, last.at + cfg.heartbeatMs, jitter, cfg)).toBe(true);
  });
});

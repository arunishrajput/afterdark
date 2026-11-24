import { DEFAULT_CONFIG, offsetByMeters } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { type GateConfig, MotionTracker, shouldSend } from './locationGate';

const cfg: GateConfig = {
  sendIntervalMs: DEFAULT_CONFIG.locationSendIntervalMs,
  minMoveM: DEFAULT_CONFIG.locationMinMoveM,
  heartbeatMs: DEFAULT_CONFIG.stationarySendIntervalMs,
  windowMs: DEFAULT_CONFIG.stationaryWindowS * 1000,
};
const HOME = { lat: 28.6139, lng: 77.209 };
const last = { ...HOME, at: 10_000 };

describe('shouldSend', () => {
  it('always sends the first fix', () => {
    expect(shouldSend(undefined, 0, false, cfg)).toBe(true);
    expect(shouldSend(undefined, 0, true, cfg)).toBe(true);
  });

  it('sends every second while moving, and not faster', () => {
    expect(shouldSend(last, last.at + cfg.sendIntervalMs - 1, false, cfg)).toBe(false);
    expect(shouldSend(last, last.at + cfg.sendIntervalMs, false, cfg)).toBe(true);
  });

  it('sends every 5 seconds while stationary', () => {
    expect(shouldSend(last, last.at + cfg.sendIntervalMs, true, cfg)).toBe(false);
    expect(shouldSend(last, last.at + cfg.heartbeatMs - 1, true, cfg)).toBe(false);
    expect(shouldSend(last, last.at + cfg.heartbeatMs, true, cfg)).toBe(true);
  });
});

describe('MotionTracker', () => {
  const seconds = (n: number) => n * 1000;

  it('says moving until it has a full window of history', () => {
    const t = new MotionTracker(cfg);
    t.observe(HOME, 0);
    t.observe(HOME, seconds(5));
    expect(t.isStationary(seconds(5))).toBe(false);
  });

  it('says stationary after a window with under 3 m of net movement', () => {
    const t = new MotionTracker(cfg);
    for (let s = 0; s <= 10; s++) t.observe(offsetByMeters(HOME, s % 2, 0), seconds(s));
    expect(t.isStationary(seconds(10))).toBe(true);
  });

  it('says moving as soon as the player has moved 3 m or more over the window', () => {
    const t = new MotionTracker(cfg);
    for (let s = 0; s <= 10; s++) t.observe(HOME, seconds(s));
    expect(t.isStationary(seconds(10))).toBe(true);
    t.observe(offsetByMeters(HOME, 4, 0), seconds(11));
    expect(t.isStationary(seconds(11))).toBe(false);
  });

  it('forgets old positions: a walker who stops becomes stationary after one window', () => {
    const t = new MotionTracker(cfg);
    for (let s = 0; s < 10; s++) t.observe(offsetByMeters(HOME, s * 1.4, 0), seconds(s));
    const stopped = offsetByMeters(HOME, 14, 0);
    for (let s = 10; s <= 21; s++) t.observe(stopped, seconds(s));
    expect(t.isStationary(seconds(21))).toBe(true);
  });

  it('starts over after reset', () => {
    const t = new MotionTracker(cfg);
    for (let s = 0; s <= 10; s++) t.observe(HOME, seconds(s));
    t.reset();
    expect(t.isStationary(seconds(10))).toBe(false);
  });
});

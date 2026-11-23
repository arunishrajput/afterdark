import { describe, expect, it } from 'vitest';

import {
  clockView,
  createClock,
  gameNow,
  isPaused,
  isRunning,
  pauseClock,
  resumeClock,
  startClock,
  wallTimeOf,
} from './clock';

const T0 = 1_000_000;

describe('GameClock', () => {
  it('does not run until it is started', () => {
    const c = createClock();
    expect(isRunning(c)).toBe(false);
    expect(gameNow(c, T0 + 5000)).toBe(0);
  });

  it('counts real time once started', () => {
    const c = createClock();
    startClock(c, T0);
    expect(isRunning(c)).toBe(true);
    expect(gameNow(c, T0 + 90_000)).toBe(90_000);
  });

  it('stops while paused and continues afterwards without the paused time', () => {
    const c = createClock();
    startClock(c, T0);
    pauseClock(c, 'host', T0 + 10_000);
    expect(isPaused(c)).toBe(true);
    expect(gameNow(c, T0 + 70_000)).toBe(10_000);
    resumeClock(c, 'host', T0 + 70_000);
    expect(gameNow(c, T0 + 80_000)).toBe(20_000);
  });

  it('stays stopped until every pause reason is cleared (nested pauses)', () => {
    const c = createClock();
    startClock(c, T0);
    pauseClock(c, 'host', T0 + 1000);
    pauseClock(c, 'meeting', T0 + 2000);
    resumeClock(c, 'host', T0 + 3000);
    expect(isRunning(c)).toBe(false);
    expect(gameNow(c, T0 + 9000)).toBe(1000);
    resumeClock(c, 'meeting', T0 + 10_000);
    expect(isRunning(c)).toBe(true);
    expect(gameNow(c, T0 + 12_000)).toBe(3000);
  });

  it('ignores a duplicate pause and a resume of a reason that was never set', () => {
    const c = createClock();
    startClock(c, T0);
    pauseClock(c, 'host', T0 + 1000);
    pauseClock(c, 'host', T0 + 2000);
    resumeClock(c, 'meeting', T0 + 3000);
    expect(isPaused(c)).toBe(true);
    resumeClock(c, 'host', T0 + 4000);
    expect(gameNow(c, T0 + 5000)).toBe(2000);
  });

  it('a pause before start keeps it stopped after start', () => {
    const c = createClock();
    pauseClock(c, 'host', T0);
    startClock(c, T0 + 1000);
    expect(isRunning(c)).toBe(false);
    resumeClock(c, 'host', T0 + 5000);
    expect(gameNow(c, T0 + 6000)).toBe(1000);
  });

  it('converts a game-time deadline into wall time while running', () => {
    const c = createClock();
    startClock(c, T0);
    expect(wallTimeOf(c, 60_000, T0 + 20_000)).toBe(T0 + 60_000);
    pauseClock(c, 'host', T0 + 20_000);
    expect(wallTimeOf(c, 60_000, T0 + 50_000)).toBeUndefined();
  });

  it('builds the display pair: endsAt is constant while running, and pausedAt marks the freeze', () => {
    const c = createClock();
    startClock(c, T0);
    expect(clockView(c, 60_000, T0 + 20_000)).toEqual({ endsAt: T0 + 60_000 });
    expect(clockView(c, 60_000, T0 + 30_000)).toEqual({ endsAt: T0 + 60_000 });
    pauseClock(c, 'host', T0 + 20_000);
    const a = clockView(c, 60_000, T0 + 50_000);
    const b = clockView(c, 60_000, T0 + 90_000);
    expect(a).toEqual(b); // nothing moves with `now`, so a view diff sees no change
    expect(a.pausedAt).toBe(T0 + 20_000);
    expect(a.endsAt - (a.pausedAt ?? 0)).toBe(40_000);
  });

  it('after a resume the pause marker is gone and endsAt has moved by the paused time', () => {
    const c = createClock();
    startClock(c, T0);
    pauseClock(c, 'host', T0 + 20_000);
    resumeClock(c, 'host', T0 + 50_000);
    expect(clockView(c, 60_000, T0 + 60_000)).toEqual({ endsAt: T0 + 90_000 });
  });
});

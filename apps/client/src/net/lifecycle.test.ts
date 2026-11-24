import { describe, expect, it } from 'vitest';

import { awayLongEnough, awayNoticeApplies, reconnectBannerVisible } from './lifecycle';

describe('awayLongEnough', () => {
  it('is true only past the stale limit', () => {
    expect(awayLongEnough(10_000, 10)).toBe(false);
    expect(awayLongEnough(10_001, 10)).toBe(true);
    expect(awayLongEnough(0, 10)).toBe(false);
  });
});

describe('awayNoticeApplies', () => {
  it('is for a running game, not the lobby, results or Home', () => {
    for (const p of ['spawning', 'reveal', 'playing']) expect(awayNoticeApplies(p)).toBe(true);
    for (const p of ['lobby', 'ended', undefined]) expect(awayNoticeApplies(p)).toBe(false);
  });
});

describe('reconnectBannerVisible', () => {
  it('waits out a blip, then shows', () => {
    expect(reconnectBannerVisible(true, 1000, 2500, 2000)).toBe(false);
    expect(reconnectBannerVisible(true, 1000, 3000, 2000)).toBe(true);
  });
  it('never shows while connected or outside a lobby', () => {
    expect(reconnectBannerVisible(true, undefined, 9999, 2000)).toBe(false);
    expect(reconnectBannerVisible(false, 0, 9999, 2000)).toBe(false);
  });
});

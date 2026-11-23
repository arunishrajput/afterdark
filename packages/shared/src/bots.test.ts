import { describe, expect, it } from 'vitest';

import { BotWalker, ChaseBrain, jittered, stepToward } from './bots';
import { DEFAULT_CONFIG } from './config/defaults';
import { distanceM, offsetByMeters } from './geo/distance';
import { createRng } from './rng';

const HOME = { lat: 28.6139, lng: 77.209 };

describe('stepToward', () => {
  it('moves exactly one step along the line', () => {
    const to = offsetByMeters(HOME, 100, 0);
    const next = stepToward(HOME, to, 10);
    expect(distanceM(HOME, next)).toBeCloseTo(10, 0);
    expect(distanceM(next, to)).toBeCloseTo(90, 0);
  });

  it('lands on the target when it is closer than a step', () => {
    const to = offsetByMeters(HOME, 3, 4);
    expect(stepToward(HOME, to, 10)).toEqual(to);
  });
});

describe('jittered', () => {
  it('stays within the jitter radius on each axis', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) {
      const p = jittered(HOME, rng, 3);
      expect(distanceM(HOME, p)).toBeLessThanOrEqual(3 * Math.SQRT2 + 0.1);
    }
  });
});

describe('BotWalker', () => {
  const make = (allowed = (_p: { lat: number; lng: number }) => true, seed = 1) =>
    new BotWalker({
      start: HOME,
      rng: createRng(seed),
      config: DEFAULT_CONFIG,
      allowed,
      home: HOME,
    });

  it('walks to its spawn at the configured speed (1.4 m/s)', () => {
    const w = make();
    const spawn = offsetByMeters(HOME, 140, 0);
    for (let i = 0; i < 50; i++) w.step(spawn);
    expect(distanceM(w.pos, HOME)).toBeCloseTo(70, 0); // 50 steps × 1.4 m
    for (let i = 0; i < 60; i++) w.step(spawn);
    expect(distanceM(w.pos, spawn)).toBeLessThan(1);
  });

  it('never exceeds the server speed limit', () => {
    const w = make();
    const spawn = offsetByMeters(HOME, 500, 0);
    let last = w.pos;
    for (let i = 0; i < 20; i++) {
      const p = w.step(spawn);
      expect(distanceM(last, p) / DEFAULT_CONFIG.botStepS).toBeLessThan(DEFAULT_CONFIG.maxSpeedMps);
      last = p;
    }
  });

  it('wanders inside the allowed area once it has no spawn to go to', () => {
    const inside = (p: { lat: number; lng: number }) => distanceM(p, HOME) < 80;
    const w = make(inside);
    for (let i = 0; i < 400; i++) {
      w.step(undefined);
      expect(distanceM(w.pos, HOME)).toBeLessThan(85);
    }
    expect(distanceM(w.pos, HOME)).toBeGreaterThan(0);
  });

  it('is deterministic for a seed', () => {
    const run = (seed: number) => {
      const w = make(() => true, seed);
      for (let i = 0; i < 30; i++) w.step(undefined);
      return w.pos;
    };
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });
});

describe('ChaseBrain (imposter bots)', () => {
  const brain = (allowed = (_p: { lat: number; lng: number }) => true) =>
    new ChaseBrain({ infectionRadiusM: 8, rng: createRng(3), allowed });
  const input = (over: Partial<Parameters<ChaseBrain['decide']>[0]> = {}) => ({
    here: HOME,
    targets: [offsetByMeters(HOME, 40, 0), offsetByMeters(HOME, 12, 0)],
    ready: true,
    channelling: false,
    completed: 0,
    ...over,
  });

  it('walks to the nearest target', () => {
    expect(brain().decide(input())).toEqual({ type: 'go', to: offsetByMeters(HOME, 12, 0) });
  });

  it('wanders when no target is known', () => {
    expect(brain().decide(input({ targets: [] }))).toEqual({ type: 'go', to: undefined });
  });

  it('infects only when ready and inside the radius minus the margin', () => {
    const close = [offsetByMeters(HOME, 4, 0)];
    expect(brain().decide(input({ targets: close }))).toEqual({ type: 'infect' });
    expect(brain().decide(input({ targets: close, ready: false }))).toMatchObject({ type: 'go' });
    const edge = [offsetByMeters(HOME, 7, 0)]; // inside 8 m but within the jitter margin
    expect(brain().decide(input({ targets: edge }))).toMatchObject({ type: 'go' });
  });

  it('keeps following the target during the channel instead of starting another', () => {
    const t = [offsetByMeters(HOME, 4, 0)];
    expect(brain().decide(input({ targets: t, channelling: true }))).toEqual({
      type: 'go',
      to: t[0],
    });
  });

  it('walks away after a completed infection, then hunts again', () => {
    const b = brain();
    const t = [offsetByMeters(HOME, 2, 0)];
    const first = b.decide(input({ targets: t, completed: 1 }));
    expect(first.type).toBe('go');
    const goal = first.type === 'go' ? first.to : undefined;
    expect(goal && distanceM(HOME, goal)).toBeGreaterThan(20);
    // Still near the spot: keep retreating. Far enough: back to the hunt.
    expect(b.decide(input({ targets: t, completed: 1, here: offsetByMeters(HOME, 5, 0) }))).toEqual(
      first,
    );
    const far = goal ?? HOME;
    expect(
      b.decide(input({ targets: [offsetByMeters(far, 30, 0)], completed: 1, here: far })),
    ).toEqual({
      type: 'go',
      to: offsetByMeters(far, 30, 0),
    });
  });

  it('picks a retreat spot inside the allowed area when one exists', () => {
    const inside = (p: { lat: number; lng: number }) => p.lng >= HOME.lng; // only east of HOME
    const a = brain(inside).decide(input({ targets: [HOME], completed: 1 }));
    expect(a.type === 'go' && a.to && inside(a.to)).toBe(true);
  });
});

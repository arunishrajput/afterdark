import { DEFAULT_CONFIG, offsetByMeters } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { gameNow } from '../clock';
import {
  advanceTo,
  advanceWithEffects,
  HOME,
  moveTo,
  newLobby,
  run,
  S,
  toPlaying,
  toReveal,
} from '../testkit';
import type { Effect } from '../types';
import { isOutOfBounds, isZoneLocked, penaltiesDue } from './zone';

const OUT = offsetByMeters(HOME, 600, 0); // well outside the 250 m boundary
const GRACE = DEFAULT_CONFIG.zoneGraceS;
const EVERY = DEFAULT_CONFIG.zonePenaltyIntervalS;

const eventsFor = (effects: Effect[], id: string, type: string) =>
  effects.filter(
    (e) =>
      e.kind === 'event' &&
      e.event.type === type &&
      Array.isArray(e.to) &&
      (e.to as readonly string[]).includes(id),
  );

describe('penaltiesDue (RULES §9.2)', () => {
  it('is 0 inside the grace, 1 at its end, then one more per interval', () => {
    const due = (s: number) => penaltiesDue(s * S, DEFAULT_CONFIG);
    expect(due(0)).toBe(0);
    expect(due(GRACE - 0.1)).toBe(0);
    expect(due(GRACE)).toBe(1);
    expect(due(GRACE + EVERY - 0.1)).toBe(1);
    expect(due(GRACE + EVERY)).toBe(2);
    expect(due(GRACE + 5 * EVERY)).toBe(6);
  });
});

describe('isOutOfBounds', () => {
  const { state } = toPlaying(newLobby({ players: 5 }));

  it('is false inside the boundary and true outside it', () => {
    expect(isOutOfBounds(state, HOME)).toBe(false);
    expect(isOutOfBounds(state, OUT)).toBe(true);
  });

  it('counts a point inside a no-go zone as out of bounds, though it is inside the boundary', () => {
    const c = offsetByMeters(HOME, 100, 0);
    const corners = [
      offsetByMeters(c, -30, -30),
      offsetByMeters(c, 30, -30),
      offsetByMeters(c, 30, 30),
      offsetByMeters(c, -30, 30),
    ].map((p) => [p.lng, p.lat] as [number, number]);
    const withZone = structuredClone(state);
    withZone.setup.noGo = [[...corners, corners[0] as [number, number]]];
    expect(isOutOfBounds(withZone, c)).toBe(true);
    expect(isOutOfBounds(withZone, HOME)).toBe(false);
  });

  it('is false when there is no boundary', () => {
    const none = structuredClone(state);
    delete none.boundary;
    expect(isOutOfBounds(none, OUT)).toBe(false);
  });
});

describe('zone penalties during play', () => {
  const start = () => toPlaying(newLobby({ players: 5 }));

  it('warns the player at once, and only that player', () => {
    const { state, now } = start();
    const res = run(state, { type: 'teleport', playerId: 'p1', lat: OUT.lat, lng: OUT.lng }, now + S);
    expect(eventsFor(res.effects, 'p1', 'zone.warning')).toHaveLength(1);
    expect(eventsFor(res.effects, 'p2', 'zone.warning')).toHaveLength(0);
    expect(isZoneLocked(res.state.players.find((p) => p.id === 'p1') ?? { id: '', username: '', ready: false, connected: true })).toBe(true);
    expect(res.effects.every((e) => e.kind !== 'event' || e.to !== 'all' || e.event.type !== 'zone.warning')).toBe(true);
  });

  it('takes nothing during the grace, then 1 personal point at its end and 1 every interval', () => {
    const { state, now } = start();
    let s = moveTo(state, 'p1', OUT, now + S);
    const t0 = now + S;
    const score = (st: typeof s) => st.players.find((p) => p.id === 'p1')?.personalScore;
    s = advanceTo(s, t0 + (GRACE - 1) * S);
    expect(score(s)).toBe(0);
    const at = advanceWithEffects(s, t0 + GRACE * S);
    expect(score(at.state)).toBe(-1);
    expect(eventsFor(at.effects, 'p1', 'zone.penalty')).toHaveLength(1);
    expect(score(advanceTo(at.state, t0 + (GRACE + EVERY - 1) * S))).toBe(-1);
    expect(score(advanceTo(at.state, t0 + (GRACE + EVERY) * S))).toBe(-2);
  });

  it('never touches the team score or anyone else’s points (RULES §9.4)', () => {
    const { state, now } = start();
    let s = moveTo(state, 'p1', OUT, now + S);
    s = advanceTo(s, now + S + 90 * S);
    expect(s.game?.teamScore).toBe(0);
    for (const p of s.players.filter((x) => x.id !== 'p1')) expect(p.personalScore).toBe(0);
    expect(s.players.find((p) => p.id === 'p1')?.personalScore ?? 0).toBeLessThan(0);
  });

  it('applies to imposters and crew alike', () => {
    const { state, now } = start();
    const imposter = state.players.find((p) => p.role === 'imposter');
    const crew = state.players.find((p) => p.role === 'crew');
    let s = state;
    for (const p of [imposter, crew]) s = moveTo(s, p?.id ?? '', OUT, now + S);
    s = advanceTo(s, now + S + GRACE * S);
    expect(s.players.find((p) => p.id === imposter?.id)?.personalScore).toBe(-1);
    expect(s.players.find((p) => p.id === crew?.id)?.personalScore).toBe(-1);
  });

  it('returning clears the lock, and going out again restarts the grace', () => {
    const { state, now } = start();
    const t0 = now + S;
    let s = moveTo(state, 'p1', OUT, t0);
    s = advanceTo(s, t0 + 10 * S);
    s = moveTo(s, 'p1', HOME, t0 + 11 * S);
    expect(s.players.find((p) => p.id === 'p1')?.zone).toBeUndefined();
    s = moveTo(s, 'p1', OUT, t0 + 12 * S);
    s = advanceTo(s, t0 + 12 * S + (GRACE - 1) * S);
    expect(s.players.find((p) => p.id === 'p1')?.personalScore).toBe(0);
  });

  it('a no-go zone counts as out of bounds', () => {
    const { state, now } = start();
    const c = offsetByMeters(HOME, 100, 0);
    const corners = [
      offsetByMeters(c, -30, -30),
      offsetByMeters(c, 30, -30),
      offsetByMeters(c, 30, 30),
      offsetByMeters(c, -30, 30),
    ].map((p) => [p.lng, p.lat] as [number, number]);
    const s0 = structuredClone(state);
    s0.setup.noGo = [[...corners, corners[0] as [number, number]]];
    const s = moveTo(s0, 'p1', c, now + S);
    expect(s.players.find((p) => p.id === 'p1')?.zone).toBeDefined();
  });

  it('a weak fix does not start a stay', () => {
    const { state, now } = start();
    const s = run(
      state,
      { type: 'locUpdate', playerId: 'p1', fix: { ...OUT, accuracy: 80, ts: now + S } },
      now + S,
    ).state;
    expect(s.players.find((p) => p.id === 'p1')?.zone).toBeUndefined();
  });

  it('is frozen while the host has paused (penalties follow game time)', () => {
    const { state, now } = start();
    const t0 = now + S;
    let s = moveTo(state, 'p1', OUT, t0);
    s = run(s, { type: 'pause', playerId: 'host' }, t0 + 5 * S).state;
    s = advanceTo(s, t0 + 600 * S);
    expect(s.players.find((p) => p.id === 'p1')?.personalScore).toBe(0);
    s = run(s, { type: 'resume', playerId: 'host' }, t0 + 600 * S).state;
    s = advanceTo(s, t0 + 600 * S + 9 * S);
    expect(s.players.find((p) => p.id === 'p1')?.personalScore).toBe(0); // 5 + 9 = 14 s < 15 s grace
    s = advanceTo(s, t0 + 600 * S + 10 * S);
    expect(s.players.find((p) => p.id === 'p1')?.personalScore).toBe(-1);
    expect(gameNow(s.game?.clock ?? { gameMs: 0, started: false, reasons: [] }, t0 + 610 * S)).toBe(16 * S); // 1 s before the fix + 5 s before the pause + 10 s after the resume
  });

  it('does nothing before play: a player outside during the reveal gets no zone state', () => {
    const reveal = toReveal(newLobby({ players: 5 }));
    const s = moveTo(reveal.state, 'p1', OUT, reveal.now + S);
    expect(s.phase).toBe('reveal');
    expect(s.players.find((p) => p.id === 'p1')?.zone).toBeUndefined();
  });

  it('charges the missed ticks in one go when a long gap ends with the player still out', () => {
    const { state, now } = start();
    const t0 = now + S;
    let s = moveTo(state, 'p1', OUT, t0);
    s = advanceTo(s, t0 + (GRACE + 3 * EVERY) * S);
    expect(s.players.find((p) => p.id === 'p1')?.personalScore).toBe(-4);
  });
});

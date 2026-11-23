import { createRng, DEFAULT_CONFIG } from '@afterdark/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { rngCodeSource } from './lobbyCode';
import type { Room } from './Room';
import { RoomManager } from './RoomManager';

const T0 = 1_700_000_000_000;
const IDLE_MS = DEFAULT_CONFIG.lobbyIdleTimeoutMin * 60_000;
const COUNTDOWN_MS = DEFAULT_CONFIG.startCountdownS * 1000;

function setup() {
  let t = T0;
  const deleted: string[] = [];
  const created: Room[] = [];
  const mgr = new RoomManager({
    now: () => t,
    allowTestMode: true,
    codeSource: rngCodeSource(createRng(1)),
    onCreate: (r) => created.push(r),
    onDelete: (c) => deleted.push(c),
  });
  return { mgr, deleted, created, advance: (ms: number) => (t += ms) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('RoomManager', () => {
  it('creates rooms with unique codes and finds them by code', () => {
    const { mgr, created } = setup();
    const a = mgr.create({ playerId: 'h1', username: 'Ann' });
    const b = mgr.create({ playerId: 'h2', username: 'Bob' });
    expect(a.code).not.toBe(b.code);
    expect(mgr.get(a.code)).toBe(a);
    expect(created).toEqual([a, b]);
    expect(a.state.hostId).toBe('h1');
    mgr.closeAll();
  });

  it('deletes a room only after nobody has been connected for lobbyIdleTimeoutMin', () => {
    const { mgr, deleted, advance } = setup();
    const room = mgr.create({ playerId: 'h1', username: 'Ann' });
    room.dispatch({ type: 'disconnect', playerId: 'h1' });
    advance(IDLE_MS - 1);
    expect(mgr.sweep()).toEqual([]);
    advance(1);
    expect(mgr.sweep()).toEqual([room.code]);
    expect(mgr.get(room.code)).toBeUndefined();
    expect(deleted).toEqual([room.code]);
  });

  it('a reconnect resets the idle timer', () => {
    const { mgr, advance } = setup();
    const room = mgr.create({ playerId: 'h1', username: 'Ann' });
    room.dispatch({ type: 'disconnect', playerId: 'h1' });
    advance(IDLE_MS - 1);
    room.dispatch({ type: 'connect', playerId: 'h1' });
    advance(IDLE_MS);
    expect(mgr.sweep()).toEqual([]);
    mgr.closeAll();
  });
});

describe('Room', () => {
  it('notifies listeners with the new state and effects after each command', () => {
    const { mgr } = setup();
    const room = mgr.create({ playerId: 'h1', username: 'Ann' });
    const seen: string[] = [];
    room.subscribe((s, effects) => seen.push(`${s.players.length}:${effects.length}`));
    room.dispatch({ type: 'join', playerId: 'p1', username: 'Bea' });
    expect(seen).toEqual(['2:0']);
    expect(room.dispatch({ type: 'join', playerId: 'p2', username: 'bea' })).toMatchObject({
      ok: false,
      code: 'NAME_TAKEN',
    });
    expect(seen).toEqual(['2:0']); // failed commands don't notify
    mgr.closeAll();
  });

  it('ticks every tickIntervalMs, so the countdown ends on its own', () => {
    vi.useFakeTimers();
    const { mgr, advance } = setup();
    const room = mgr.create({ playerId: 'h1', username: 'Ann' });
    for (const [id, name] of [
      ['p1', 'Bea'],
      ['p2', 'Cy'],
      ['p3', 'Di'],
    ] as const) {
      room.dispatch({ type: 'join', playerId: id, username: name });
    }
    room.dispatch({
      type: 'setBoundary',
      playerId: 'h1',
      boundary: { type: 'circle', center: { lat: 28.6139, lng: 77.209 }, radiusM: 120 },
    });
    for (const p of room.state.players) {
      room.dispatch({
        type: 'locUpdate',
        playerId: p.id,
        fix: { lat: 28.6139, lng: 77.209, accuracy: 5, ts: T0 },
      });
      room.dispatch({ type: 'setReady', playerId: p.id, ready: true });
    }
    expect(room.state.countdownEndsAt).toBe(T0 + COUNTDOWN_MS);
    advance(COUNTDOWN_MS);
    vi.advanceTimersByTime(DEFAULT_CONFIG.tickIntervalMs);
    expect(room.state.phase).toBe('starting');
    mgr.closeAll();
  });
});

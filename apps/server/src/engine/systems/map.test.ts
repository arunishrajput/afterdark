import { DEFAULT_CONFIG, offsetByMeters, toPosition } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { reduce, type ReduceResult } from '../reduce';
import { createRoomState, type RoomState } from '../state';

const T0 = 1_700_000_000_000;
const S = 1000;
const C = { lat: 28.6139, lng: 77.209 };

type OkResult = Extract<ReduceResult, { ok: true }>;
const ok = (res: ReduceResult): OkResult => {
  if (!res.ok) throw new Error(`expected ok, got ${res.code}: ${res.message}`);
  return res;
};

const circle = (radiusM: number) => ({ type: 'circle' as const, center: C, radiusM });

function lobby(extra = 3): RoomState {
  let s = createRoomState({
    code: 'ABC234',
    hostId: 'host',
    username: 'Host',
    allowTestMode: true,
    radarSalt: 'salt',
  });
  for (let i = 1; i <= extra; i++) {
    s = ok(reduce(s, { type: 'join', playerId: `p${i}`, username: `P${i}` }, T0)).state;
  }
  return s;
}

function located(s: RoomState): RoomState {
  let out = s;
  for (const p of s.players) {
    out = ok(
      reduce(out, { type: 'locUpdate', playerId: p.id, fix: { ...C, accuracy: 5, ts: T0 } }, T0),
    ).state;
  }
  return out;
}

function readyAll(s: RoomState): OkResult {
  let res: OkResult = { ok: true, state: s, effects: [] };
  for (const p of s.players) {
    res = ok(reduce(res.state, { type: 'setReady', playerId: p.id, ready: true }, T0));
  }
  return res;
}

describe('lobby:setBoundary (RULES §3.4, MAP_AND_REGIONS §1)', () => {
  it('stores a circle as a 64-gon with its area', () => {
    const res = ok(
      reduce(lobby(), { type: 'setBoundary', playerId: 'host', boundary: circle(100) }, T0),
    );
    expect(res.state.boundary?.ring).toHaveLength(65);
    expect(res.state.boundary?.areaM2).toBeGreaterThan(Math.PI * 100 * 100 * 0.99);
  });

  it('stores a polygon ring, closed', () => {
    const pts = [
      offsetByMeters(C, -80, -80),
      offsetByMeters(C, 80, -80),
      offsetByMeters(C, 80, 80),
      offsetByMeters(C, -80, 80),
    ].map(toPosition);
    const res = ok(
      reduce(
        lobby(),
        { type: 'setBoundary', playerId: 'host', boundary: { type: 'polygon', coords: pts } },
        T0,
      ),
    );
    expect(res.state.boundary?.ring).toHaveLength(5);
  });

  it('only the host may set it', () => {
    const res = reduce(lobby(), { type: 'setBoundary', playerId: 'p1', boundary: circle(100) }, T0);
    expect(res).toMatchObject({ ok: false, code: 'NOT_HOST' });
  });

  it('only in the lobby', () => {
    const s = lobby();
    s.phase = 'spawning';
    const res = reduce(s, { type: 'setBoundary', playerId: 'host', boundary: circle(100) }, T0);
    expect(res).toMatchObject({ ok: false, code: 'WRONG_PHASE' });
  });

  it('rejects invalid shapes with a clear message', () => {
    const tooSmall = reduce(
      lobby(),
      { type: 'setBoundary', playerId: 'host', boundary: circle(20) },
      T0,
    );
    expect(tooSmall).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
    if (!tooSmall.ok) expect(tooSmall.message).toMatch(/too small/i);

    const tooLarge = reduce(
      lobby(),
      { type: 'setBoundary', playerId: 'host', boundary: circle(1500) },
      T0,
    );
    expect(tooLarge).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
    if (!tooLarge.ok) expect(tooLarge.message).toMatch(/too large/i);

    const [a, b, c, d] = [
      offsetByMeters(C, -80, -80),
      offsetByMeters(C, 80, -80),
      offsetByMeters(C, 80, 80),
      offsetByMeters(C, -80, 80),
    ].map(toPosition);
    const bow = reduce(
      lobby(),
      {
        type: 'setBoundary',
        playerId: 'host',
        boundary: { type: 'polygon', coords: [a!, c!, b!, d!] },
      },
      T0,
    );
    expect(bow).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
    if (!bow.ok) expect(bow.message).toMatch(/crosses itself/i);
  });

  it('un-readies everyone and announces the change', () => {
    const ready = readyAll(located(lobby(3)));
    expect(ready.state.players.every((p) => p.ready)).toBe(true);
    const res = ok(
      reduce(ready.state, { type: 'setBoundary', playerId: 'host', boundary: circle(100) }, T0),
    );
    expect(res.state.players.some((p) => p.ready)).toBe(false);
    expect(res.effects).toContainEqual({
      kind: 'event',
      to: 'all',
      event: { type: 'lobby.mapChanged' },
    });
  });

  it('setting the identical boundary again changes nothing and does not un-ready', () => {
    const first = ok(
      reduce(
        located(lobby(3)),
        { type: 'setBoundary', playerId: 'host', boundary: circle(100) },
        T0,
      ),
    );
    const ready = readyAll(first.state);
    const again = ok(
      reduce(ready.state, { type: 'setBoundary', playerId: 'host', boundary: circle(100) }, T0),
    );
    expect(again.state.players.every((p) => p.ready)).toBe(true);
    expect(
      again.effects.filter((e) => e.kind === 'event' && e.event.type === 'lobby.mapChanged'),
    ).toHaveLength(0);
  });
});

describe('countdown needs a boundary (RULES §3.7)', () => {
  it('everyone ready but no boundary → no countdown; setting it later un-readies instead', () => {
    const res = readyAll(located(lobby(3)));
    expect(res.state.countdownEndsAt).toBeUndefined();
    expect(res.state.players.every((p) => p.ready)).toBe(true);
  });

  it('starts once a boundary exists and everyone is ready', () => {
    const withBoundary = ok(
      reduce(
        located(lobby(3)),
        { type: 'setBoundary', playerId: 'host', boundary: circle(100) },
        T0,
      ),
    );
    const res = readyAll(withBoundary.state);
    expect(res.state.countdownEndsAt).toBe(T0 + DEFAULT_CONFIG.startCountdownS * S);
  });
});

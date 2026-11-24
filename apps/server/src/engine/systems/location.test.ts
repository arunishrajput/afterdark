import { DEFAULT_CONFIG, offsetByMeters } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { reduce, type ReduceResult } from '../reduce';
import { createRoomState, type RoomState } from '../state';
import { tick } from '../tick';
import { fixQuality } from './location';

const T0 = 1_700_000_000_000;
const S = 1000;
const HOME = { lat: 28.6139, lng: 77.209 };
const MAX_SPEED = DEFAULT_CONFIG.maxSpeedMps;

type OkResult = Extract<ReduceResult, { ok: true }>;
const ok = (res: ReduceResult): OkResult => {
  if (!res.ok) throw new Error(`expected ok, got ${res.code}: ${res.message}`);
  return res;
};
const errCode = (res: ReduceResult) => (res.ok ? 'OK' : res.code);

function room(testMode = false): RoomState {
  const s = createRoomState({
    code: 'ABC234',
    hostId: 'host',
    username: 'Host',
    allowTestMode: true,
    radarSalt: 'salt',
  });
  s.config.testMode = testMode;
  return s;
}

/** A fix `eastM` metres east of HOME, timestamped `tsS` seconds after T0. */
const fix = (eastM: number, tsS: number, accuracy = 8) => ({
  ...offsetByMeters(HOME, eastM, 0),
  accuracy,
  ts: T0 + tsS * S,
});

/** Send a fix, with the server clock at the fix's own timestamp unless overridden. */
function send(state: RoomState, f: ReturnType<typeof fix>, now = f.ts): OkResult {
  return ok(reduce(state, { type: 'locUpdate', playerId: 'host', fix: f }, now));
}

const loc = (s: RoomState) => s.players[0]?.loc;
const pending = (s: RoomState) => s.players[0]?.locPending ?? [];

describe('storing fixes (RULES §10, ARCHITECTURE §5)', () => {
  it('stores the latest fix with its timestamps', () => {
    const s = send(room(), fix(0, 0)).state;
    expect(loc(s)).toMatchObject({ accuracy: 8, ts: T0, receivedAt: T0 });
    const s2 = send(s, fix(5, 2), T0 + 2 * S + 300).state;
    expect(loc(s2)).toMatchObject({ ts: T0 + 2 * S, receivedAt: T0 + 2 * S + 300 });
  });

  it('rejects a fix from the future (> futureFixToleranceS ahead) and stores nothing', () => {
    const tooFar = fix(0, DEFAULT_CONFIG.futureFixToleranceS + 1);
    const res = reduce(room(), { type: 'locUpdate', playerId: 'host', fix: tooFar }, T0);
    expect(errCode(res)).toBe('INVALID_PAYLOAD');
  });

  it('accepts a fix inside the future tolerance', () => {
    const s = send(room(), fix(0, DEFAULT_CONFIG.futureFixToleranceS - 0.5), T0).state;
    expect(loc(s)).toBeDefined();
  });

  it('rejects an unknown player', () => {
    const res = reduce(room(), { type: 'locUpdate', playerId: 'ghost', fix: fix(0, 0) }, T0);
    expect(errCode(res)).toBe('NOT_FOUND');
  });
});

describe('quality: good, weak or stale (RULES §10.2–10.3)', () => {
  const cfg = DEFAULT_CONFIG;
  const base = { lat: 0, lng: 0, ts: T0, receivedAt: T0 };

  it('is good at exactly maxAccuracyM and weak beyond it', () => {
    expect(fixQuality({ ...base, accuracy: cfg.maxAccuracyM }, T0, cfg)).toBe('good');
    expect(fixQuality({ ...base, accuracy: cfg.maxAccuracyM + 0.1 }, T0, cfg)).toBe('weak');
  });

  it('is stale once older than staleAfterS (measured on the server clock), good again with a new fix', () => {
    const f = { ...base, accuracy: 5 };
    expect(fixQuality(f, T0 + cfg.staleAfterS * S, cfg)).toBe('good');
    expect(fixQuality(f, T0 + cfg.staleAfterS * S + 1, cfg)).toBe('stale');
  });

  it('weak outranks nothing: a stale weak fix is stale', () => {
    expect(fixQuality({ ...base, accuracy: 99 }, T0 + 60 * S, cfg)).toBe('stale');
  });
});

describe('speed check and re-anchor (RULES §10.4)', () => {
  it('accepts a speed at the limit', () => {
    const s0 = send(room(), fix(0, 0)).state;
    const s1 = send(s0, fix(MAX_SPEED * 1, 1)).state;
    expect(loc(s1)?.ts).toBe(T0 + S);
  });

  it('rejects a jump faster than maxSpeedMps and keeps the old position', () => {
    const s0 = send(room(), fix(0, 0)).state;
    const s1 = send(s0, fix(MAX_SPEED * 1 + 20, 1)).state;
    expect(loc(s1)?.ts).toBe(T0); // unchanged
    expect(pending(s1)).toHaveLength(1);
  });

  it('floors the time gap at speedCheckMinDtS so two close timestamps cannot fake a speed', () => {
    const s0 = send(room(), fix(0, 0)).state;
    // 10 m in 10 ms is 1000 m/s raw, but over the 1 s floor it is 10 m/s: fine.
    const s1 = send(s0, { ...fix(10, 0), ts: T0 + 10 }, T0 + 10).state;
    expect(loc(s1)?.ts).toBe(T0 + 10);
  });

  it('re-anchors after reanchorFixes consistent fixes at the new place', () => {
    let s = send(room(), fix(0, 0)).state;
    const far = 500;
    s = send(s, fix(far, 1)).state;
    expect(loc(s)?.ts).toBe(T0);
    s = send(s, fix(far + 1, 2)).state;
    expect(loc(s)?.ts).toBe(T0);
    expect(pending(s)).toHaveLength(2);
    s = send(s, fix(far + 2, 3)).state; // the 3rd consistent fix
    expect(loc(s)?.ts).toBe(T0 + 3 * S);
    expect(pending(s)).toHaveLength(0);
  });

  it('does not re-anchor on fixes that disagree with each other', () => {
    let s = send(room(), fix(0, 0)).state;
    s = send(s, fix(500, 1)).state;
    s = send(s, fix(-500, 2)).state; // jumps again: restarts the run
    s = send(s, fix(900, 3)).state;
    expect(loc(s)?.ts).toBe(T0);
    expect(pending(s)).toHaveLength(1);
  });

  it('a normal fix clears the pending run', () => {
    let s = send(room(), fix(0, 0)).state;
    s = send(s, fix(500, 1)).state;
    expect(pending(s)).toHaveLength(1);
    s = send(s, fix(3, 2)).state;
    expect(loc(s)?.ts).toBe(T0 + 2 * S);
    expect(pending(s)).toHaveLength(0);
  });

  it('is not fooled by an out-of-order timestamp (treated as the minimum gap)', () => {
    const s0 = send(room(), fix(0, 5)).state;
    const s1 = send(s0, fix(2, 3), T0 + 5 * S).state; // older ts, 2 m away
    expect(loc(s1)?.ts).toBe(T0 + 3 * S);
  });

  it('a forged old timestamp cannot stretch the gap: the server clock bounds it (Phase 14)', () => {
    // The spoof: re-send where you are, stamped in 1970, then jump 500 m "a lifetime later".
    const s0 = send(room(), fix(0, 0)).state;
    const s1 = send(s0, { ...fix(0, 0), ts: 0 }, T0 + S).state;
    const s2 = send(s1, fix(500, 2), T0 + 2 * S).state;
    expect(loc(s2)).toMatchObject({ ts: 0 }); // the jump was refused
    expect(pending(s2)).toHaveLength(1);
  });

  it('an honest fix that arrives late still passes (the client gap is used when it is the smaller)', () => {
    const s0 = send(room(), fix(0, 0)).state;
    // 20 m in 2 s of device time is 10 m/s; the server saw 2.5 s.
    const s1 = send(s0, fix(20, 2), T0 + 2.5 * S).state;
    expect(loc(s1)?.ts).toBe(T0 + 2 * S);
  });

  it('a long real gap still allows a long move', () => {
    const s0 = send(room(), fix(0, 0)).state;
    const s1 = send(s0, fix(600, 60)).state; // 10 m/s over a minute with the screen off
    expect(loc(s1)?.ts).toBe(T0 + 60 * S);
  });

  it('counts re-anchors per player and reports each as an audit with the count only', () => {
    let s = send(room(), fix(0, 0)).state;
    const reanchor = (from: number, atS: number) => {
      let res: OkResult | undefined;
      for (let i = 0; i < DEFAULT_CONFIG.reanchorFixes; i++) {
        res = send(s, fix(from + i, atS + i));
        s = res.state;
      }
      return res?.effects ?? [];
    };
    const first = reanchor(500, 1);
    expect(s.players[0]?.gpsReanchors).toBe(1);
    expect(first).toContainEqual({
      kind: 'audit',
      what: 'gpsReanchor',
      playerId: 'host',
      count: 1,
    });
    const second = reanchor(-500, 10);
    expect(s.players[0]?.gpsReanchors).toBe(2);
    expect(second).toContainEqual({
      kind: 'audit',
      what: 'gpsReanchor',
      playerId: 'host',
      count: 2,
    });
    // The audit never carries a position.
    expect(JSON.stringify(second)).not.toMatch(/lat|lng/);
  });

  it('a test-mode teleport is not counted', () => {
    const s0 = send(room(true), fix(0, 0)).state;
    const s1 = ok(
      reduce(s0, { type: 'teleport', playerId: 'host', ...offsetByMeters(HOME, 900, 0) }, T0 + S),
    ).state;
    expect(s1.players[0]?.gpsReanchors).toBeUndefined();
  });
});

describe('ready needs a good, fresh fix (RULES §3.5)', () => {
  const ready = (s: RoomState, now: number) =>
    reduce(s, { type: 'setReady', playerId: 'host', ready: true }, now);

  it('WEAK_GPS with no fix at all', () => {
    expect(errCode(ready(room(), T0))).toBe('WEAK_GPS');
  });

  it('WEAK_GPS when the accuracy is worse than maxAccuracyM', () => {
    const s = send(room(), fix(0, 0, DEFAULT_CONFIG.maxAccuracyM + 5)).state;
    expect(errCode(ready(s, T0))).toBe('WEAK_GPS');
  });

  it('STALE when the fix is older than staleAfterS', () => {
    const s = send(room(), fix(0, 0)).state;
    expect(errCode(ready(s, T0 + (DEFAULT_CONFIG.staleAfterS + 1) * S))).toBe('STALE');
  });

  it('succeeds with a good, fresh fix, and un-readying never needs one', () => {
    const s = send(room(), fix(0, 0)).state;
    const r = ok(ready(s, T0 + S));
    expect(r.state.players[0]?.ready).toBe(true);
    const off = ok(
      reduce(r.state, { type: 'setReady', playerId: 'host', ready: false }, T0 + 100 * S),
    );
    expect(off.state.players[0]?.ready).toBe(false);
  });
});

describe('dev:teleport (test mode only)', () => {
  const tp = (s: RoomState) =>
    reduce(s, { type: 'teleport', playerId: 'host', lat: HOME.lat, lng: HOME.lng }, T0);

  it('is rejected outside test mode', () => {
    expect(errCode(tp(room(false)))).toBe('NOT_ALLOWED');
  });

  it('places the player with teleportAccuracyM, bypassing the speed check', () => {
    let s = send(room(true), fix(0, 0)).state;
    s = send(s, fix(900, 1)).state; // rejected, pending
    const res = ok(
      reduce(
        s,
        { type: 'teleport', playerId: 'host', lat: HOME.lat + 0.01, lng: HOME.lng },
        T0 + S,
      ),
    );
    expect(loc(res.state)).toMatchObject({
      lat: HOME.lat + 0.01,
      accuracy: DEFAULT_CONFIG.teleportAccuracyM,
    });
    expect(pending(res.state)).toHaveLength(0);
  });
});

describe('tick keeps locations without changing them', () => {
  it('a tick does not touch the stored fix (quality is derived, not stored)', () => {
    const s = send(room(), fix(0, 0)).state;
    const t = tick(s, T0 + 60 * S);
    expect(loc(t.state)).toEqual(loc(s));
  });
});

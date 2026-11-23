import { DEFAULT_CONFIG } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { reduce, type ReduceResult } from '../reduce';
import { createRoomState, type RoomState } from '../state';
import { tick } from '../tick';

const T0 = 1_700_000_000_000;
const S = 1000;
const COUNTDOWN_MS = DEFAULT_CONFIG.startCountdownS * S;
const GRACE_MS = DEFAULT_CONFIG.hostDisconnectGraceS * S;

type OkResult = Extract<ReduceResult, { ok: true }>;

const ok = (res: ReduceResult): OkResult => {
  if (!res.ok) throw new Error(`expected ok, got ${res.code}: ${res.message}`);
  return res;
};
const errCode = (res: ReduceResult) => (res.ok ? 'OK' : res.code);

const HOME = { lat: 28.6139, lng: 77.209 };
const CIRCLE = { type: 'circle' as const, center: HOME, radiusM: 120 };

/**
 * A lobby created by `host`, plus `extra` joined players p1…pN. By default the
 * host has drawn a boundary and everyone has a good fix, so they can ready up;
 * `bare: true` leaves the room exactly as `join` made it.
 */
function lobbyWith(
  extra: number,
  opts: { allowTestMode?: boolean; bare?: boolean } = {},
): RoomState {
  let state = createRoomState({
    code: 'ABC234',
    hostId: 'host',
    username: 'Host',
    allowTestMode: opts.allowTestMode ?? true,
    radarSalt: 'salt',
  });
  for (let i = 1; i <= extra; i++) {
    state = ok(
      reduce(state, { type: 'join', playerId: `p${i}`, username: `Player ${i}` }, T0),
    ).state;
  }
  if (opts.bare) return state;
  state = ok(reduce(state, { type: 'setBoundary', playerId: 'host', boundary: CIRCLE }, T0)).state;
  for (const p of state.players) {
    state = ok(
      reduce(
        state,
        { type: 'locUpdate', playerId: p.id, fix: { ...HOME, accuracy: 5, ts: T0 } },
        T0,
      ),
    ).state;
  }
  return state;
}

function readyAll(state: RoomState, now = T0): OkResult {
  let res: OkResult = { ok: true, state, effects: [] };
  for (const p of state.players) {
    res = ok(reduce(res.state, { type: 'setReady', playerId: p.id, ready: true }, now));
  }
  return res;
}

const player = (s: RoomState, id: string) => s.players.find((p) => p.id === id);

describe('create (RULES §3.1)', () => {
  it('makes the creator the host, in the lobby phase, not ready', () => {
    const s = lobbyWith(0, { bare: true });
    expect(s.phase).toBe('lobby');
    expect(s.hostId).toBe('host');
    expect(s.players).toEqual([{ id: 'host', username: 'Host', ready: false, connected: true }]);
    expect(s.config).toEqual(DEFAULT_CONFIG);
  });
});

describe('join (RULES §3.2–3.3)', () => {
  it('adds players in join order, un-ready and connected', () => {
    const s = lobbyWith(2);
    expect(s.players.map((p) => p.id)).toEqual(['host', 'p1', 'p2']);
    expect(player(s, 'p2')).toMatchObject({ ready: false, connected: true });
  });

  it('rejects a username already taken, case-insensitively', () => {
    const s = lobbyWith(1);
    expect(errCode(reduce(s, { type: 'join', playerId: 'x', username: 'player 1' }, T0))).toBe(
      'NAME_TAKEN',
    );
    expect(errCode(reduce(s, { type: 'join', playerId: 'x', username: 'HOST' }, T0))).toBe(
      'NAME_TAKEN',
    );
  });

  it(`holds at most maxPlayers (${DEFAULT_CONFIG.maxPlayers})`, () => {
    const s = lobbyWith(DEFAULT_CONFIG.maxPlayers - 1);
    expect(s.players).toHaveLength(DEFAULT_CONFIG.maxPlayers);
    expect(errCode(reduce(s, { type: 'join', playerId: 'x', username: 'Late' }, T0))).toBe(
      'LOBBY_FULL',
    );
  });

  it('is closed once the game is starting', () => {
    const s: RoomState = { ...lobbyWith(3), phase: 'starting' };
    expect(errCode(reduce(s, { type: 'join', playerId: 'x', username: 'Late' }, T0))).toBe(
      'GAME_IN_PROGRESS',
    );
  });

  it('does not mutate the input state (pure reducer)', () => {
    const s = lobbyWith(1);
    const before = structuredClone(s);
    reduce(s, { type: 'join', playerId: 'p9', username: 'New' }, T0);
    expect(s).toEqual(before);
  });
});

describe('ready and the start countdown (RULES §3.7)', () => {
  it('starts a countdown when every player is ready and there are ≥ 4', () => {
    const res = readyAll(lobbyWith(3));
    expect(res.state.countdownEndsAt).toBe(T0 + COUNTDOWN_MS);
    expect(res.effects).toContainEqual({
      kind: 'event',
      to: 'all',
      event: { type: 'lobby.countdown', endsAt: T0 + COUNTDOWN_MS },
    });
  });

  it('does not start with fewer than minPlayers, even if all are ready', () => {
    const res = readyAll(lobbyWith(2));
    expect(res.state.countdownEndsAt).toBeUndefined();
  });

  it('does not start while a manual imposter count leaves too few crew', () => {
    let s = lobbyWith(3);
    s = ok(
      reduce(s, { type: 'updateConfig', playerId: 'host', patch: { imposterCount: 2 } }, T0),
    ).state;
    expect(readyAll(s).state.countdownEndsAt).toBeUndefined();
  });

  it('is cancelled when anyone un-readies', () => {
    const started = readyAll(lobbyWith(3)).state;
    const res = ok(reduce(started, { type: 'setReady', playerId: 'p2', ready: false }, T0 + S));
    expect(res.state.countdownEndsAt).toBeUndefined();
    expect(res.effects).toContainEqual({
      kind: 'event',
      to: 'all',
      event: { type: 'lobby.countdownCancelled' },
    });
  });

  it('is cancelled when a new player joins (they are not ready)', () => {
    const started = readyAll(lobbyWith(3)).state;
    const res = ok(reduce(started, { type: 'join', playerId: 'p9', username: 'Late' }, T0 + S));
    expect(res.state.countdownEndsAt).toBeUndefined();
  });

  it('moves to the placeholder `starting` phase when it expires', () => {
    const started = readyAll(lobbyWith(3)).state;
    expect(tick(started, T0 + COUNTDOWN_MS - 1).state.phase).toBe('lobby');
    const done = tick(started, T0 + COUNTDOWN_MS);
    expect(done.state.phase).toBe('starting');
    expect(done.state.countdownEndsAt).toBeUndefined();
  });

  it('setReady is a no-op when nothing changes and fails outside the lobby', () => {
    const s = lobbyWith(1);
    const res = ok(reduce(s, { type: 'setReady', playerId: 'p1', ready: false }, T0));
    expect(res.effects).toEqual([]);
    const starting: RoomState = { ...s, phase: 'starting' };
    expect(errCode(reduce(starting, { type: 'setReady', playerId: 'p1', ready: true }, T0))).toBe(
      'WRONG_PHASE',
    );
  });

  it('rejects commands from unknown players', () => {
    expect(
      errCode(reduce(lobbyWith(1), { type: 'setReady', playerId: 'ghost', ready: true }, T0)),
    ).toBe('NOT_FOUND');
  });
});

describe('updateConfig (RULES §3.6)', () => {
  it('is host-only', () => {
    const res = reduce(
      lobbyWith(1),
      { type: 'updateConfig', playerId: 'p1', patch: { playTimeMin: 15 } },
      T0,
    );
    expect(errCode(res)).toBe('NOT_HOST');
  });

  it('applies the patch, un-readies everyone and cancels the countdown', () => {
    const started = readyAll(lobbyWith(3)).state;
    const res = ok(
      reduce(
        started,
        { type: 'updateConfig', playerId: 'host', patch: { playTimeMin: 15 } },
        T0 + S,
      ),
    );
    expect(res.state.config.playTimeMin).toBe(15);
    expect(res.state.players.every((p) => !p.ready)).toBe(true);
    expect(res.state.countdownEndsAt).toBeUndefined();
    expect(res.effects).toContainEqual({
      kind: 'event',
      to: 'all',
      event: { type: 'lobby.configChanged' },
    });
  });

  it('a patch that changes nothing does not un-ready anyone', () => {
    let s = lobbyWith(1);
    s = ok(reduce(s, { type: 'setReady', playerId: 'p1', ready: true }, T0)).state;
    const res = ok(
      reduce(
        s,
        { type: 'updateConfig', playerId: 'host', patch: { playTimeMin: s.config.playTimeMin } },
        T0,
      ),
    );
    expect(player(res.state, 'p1')?.ready).toBe(true);
    expect(res.effects).toEqual([]);
  });

  it('rejects enabling test mode when the server forbids it', () => {
    const s = lobbyWith(1, { allowTestMode: false });
    const res = reduce(
      s,
      { type: 'updateConfig', playerId: 'host', patch: { testMode: true } },
      T0,
    );
    expect(errCode(res)).toBe('NOT_ALLOWED');
  });

  it('is only possible in the lobby', () => {
    const s: RoomState = { ...lobbyWith(1), phase: 'starting' };
    const res = reduce(
      s,
      { type: 'updateConfig', playerId: 'host', patch: { targetScore: 50 } },
      T0,
    );
    expect(errCode(res)).toBe('WRONG_PHASE');
  });
});

describe('leave and host hand-over (RULES §3.8)', () => {
  it('removes the player in the lobby and reports it', () => {
    const res = ok(reduce(lobbyWith(2), { type: 'leave', playerId: 'p1' }, T0));
    expect(res.state.players.map((p) => p.id)).toEqual(['host', 'p2']);
    expect(res.effects).toContainEqual({ kind: 'removed', playerId: 'p1', reason: 'left' });
  });

  it('passes host to the earliest-joined connected player when the host leaves', () => {
    let s = lobbyWith(3);
    s = ok(reduce(s, { type: 'disconnect', playerId: 'p1' }, T0)).state;
    const res = ok(reduce(s, { type: 'leave', playerId: 'host' }, T0));
    expect(res.state.hostId).toBe('p2');
  });

  it('falls back to the earliest-joined player when nobody else is connected', () => {
    let s = lobbyWith(2);
    s = ok(reduce(s, { type: 'disconnect', playerId: 'p1' }, T0)).state;
    s = ok(reduce(s, { type: 'disconnect', playerId: 'p2' }, T0)).state;
    expect(ok(reduce(s, { type: 'leave', playerId: 'host' }, T0)).state.hostId).toBe('p1');
  });

  it('leaves an empty roster when the last player leaves', () => {
    expect(ok(reduce(lobbyWith(0), { type: 'leave', playerId: 'host' }, T0)).state.players).toEqual(
      [],
    );
  });

  it('can start the countdown if the only un-ready player leaves', () => {
    let s = lobbyWith(4);
    for (const id of ['host', 'p1', 'p2', 'p3']) {
      s = ok(reduce(s, { type: 'setReady', playerId: id, ready: true }, T0)).state;
    }
    const res = ok(reduce(s, { type: 'leave', playerId: 'p4' }, T0));
    expect(res.state.countdownEndsAt).toBe(T0 + COUNTDOWN_MS);
  });

  it('outside the lobby, leaving marks a permanent disconnect instead of removing', () => {
    const s: RoomState = { ...lobbyWith(3), phase: 'starting' };
    const res = ok(reduce(s, { type: 'leave', playerId: 'p1' }, T0));
    expect(player(res.state, 'p1')).toMatchObject({ connected: false, left: true });
    expect(res.effects).toContainEqual({ kind: 'removed', playerId: 'p1', reason: 'left' });
  });
});

describe('kick (RULES §3.8)', () => {
  it('is host-only and lobby-only', () => {
    expect(
      errCode(reduce(lobbyWith(2), { type: 'kick', playerId: 'p1', targetId: 'p2' }, T0)),
    ).toBe('NOT_HOST');
    const starting: RoomState = { ...lobbyWith(2), phase: 'starting' };
    expect(errCode(reduce(starting, { type: 'kick', playerId: 'host', targetId: 'p2' }, T0))).toBe(
      'WRONG_PHASE',
    );
  });

  it('removes the target and reports a kick', () => {
    const res = ok(reduce(lobbyWith(2), { type: 'kick', playerId: 'host', targetId: 'p2' }, T0));
    expect(player(res.state, 'p2')).toBeUndefined();
    expect(res.effects).toContainEqual({ kind: 'removed', playerId: 'p2', reason: 'kicked' });
  });

  it('cannot kick yourself or an unknown player', () => {
    const s = lobbyWith(1);
    expect(errCode(reduce(s, { type: 'kick', playerId: 'host', targetId: 'host' }, T0))).toBe(
      'NOT_ALLOWED',
    );
    expect(errCode(reduce(s, { type: 'kick', playerId: 'host', targetId: 'nobody' }, T0))).toBe(
      'NOT_FOUND',
    );
  });
});

describe('connection state (RULES §3.9, §10.5; ADR-036)', () => {
  it('a disconnect in the lobby marks the player offline and un-ready, cancelling a countdown', () => {
    const started = readyAll(lobbyWith(3)).state;
    const res = ok(reduce(started, { type: 'disconnect', playerId: 'p1' }, T0 + S));
    expect(player(res.state, 'p1')).toMatchObject({
      connected: false,
      ready: false,
      disconnectedAt: T0 + S,
    });
    expect(res.state.countdownEndsAt).toBeUndefined();
  });

  it('reconnecting restores the same player', () => {
    let s = ok(
      reduce(lobbyWith(1, { bare: true }), { type: 'disconnect', playerId: 'p1' }, T0),
    ).state;
    s = ok(reduce(s, { type: 'connect', playerId: 'p1' }, T0 + S)).state;
    expect(player(s, 'p1')).toEqual({
      id: 'p1',
      username: 'Player 1',
      ready: false,
      connected: true,
    });
  });

  it('tracks when the lobby became empty, and clears it on reconnect', () => {
    let s = ok(reduce(lobbyWith(1), { type: 'disconnect', playerId: 'host' }, T0)).state;
    expect(s.emptySince).toBeUndefined();
    s = ok(reduce(s, { type: 'disconnect', playerId: 'p1' }, T0 + S)).state;
    expect(s.emptySince).toBe(T0 + S);
    s = ok(reduce(s, { type: 'connect', playerId: 'p1' }, T0 + 2 * S)).state;
    expect(s.emptySince).toBeUndefined();
  });

  it('hands host over after the host is disconnected for hostDisconnectGraceS', () => {
    let s = lobbyWith(2);
    s = ok(reduce(s, { type: 'disconnect', playerId: 'host' }, T0)).state;
    expect(tick(s, T0 + GRACE_MS - 1).state.hostId).toBe('host');
    s = tick(s, T0 + GRACE_MS).state;
    expect(s.hostId).toBe('p1');
    // Coming back does not reclaim host.
    s = ok(reduce(s, { type: 'connect', playerId: 'host' }, T0 + GRACE_MS + S)).state;
    expect(s.hostId).toBe('p1');
  });

  it('keeps the host when nobody else is connected to take over', () => {
    let s = lobbyWith(1);
    s = ok(reduce(s, { type: 'disconnect', playerId: 'p1' }, T0)).state;
    s = ok(reduce(s, { type: 'disconnect', playerId: 'host' }, T0)).state;
    expect(tick(s, T0 + GRACE_MS).state.hostId).toBe('host');
  });
});

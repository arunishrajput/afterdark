import { areaContains, DEFAULT_CONFIG, distanceM, offsetByMeters } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import {
  advanceTo,
  errCode,
  HOME,
  moveTo,
  newLobby,
  readyAll,
  run,
  S,
  T0,
  toSpawning,
} from '../testkit';
import { reduce } from '../reduce';
import { playableAreaOf } from './layout';

const MIN_SEP = DEFAULT_CONFIG.spawnMinSeparationM;

describe('spawn generation (RULES §4.1)', () => {
  const { state } = toSpawning(newLobby({ players: 8 }));
  const spawns = state.players.map((p) => p.spawn);

  it('gives every player a spawn, none shared', () => {
    expect(spawns.every((s) => s !== undefined)).toBe(true);
    expect(new Set(spawns.map((s) => `${s?.lat},${s?.lng}`)).size).toBe(8);
  });

  it('keeps every spawn at least spawnMinSeparationM apart', () => {
    for (let i = 0; i < spawns.length; i++) {
      for (let j = i + 1; j < spawns.length; j++) {
        const d = distanceM(spawns[i] ?? HOME, spawns[j] ?? HOME);
        expect(d).toBeGreaterThanOrEqual(MIN_SEP);
      }
    }
  });

  it('puts every spawn inside the playable area', () => {
    const inside = areaContains(playableAreaOf(state));
    for (const s of spawns) expect(inside(s ?? { lat: 0, lng: 0 })).toBe(true);
  });

  it('keeps spawns out of no-go zones', () => {
    let s = newLobby({ players: 6 });
    const c = offsetByMeters(HOME, 60, 0);
    const zone = [
      [offsetByMeters(c, -80, -80), offsetByMeters(c, 80, -80), offsetByMeters(c, 80, 80), offsetByMeters(c, -80, 80)].map(
        (p) => [p.lng, p.lat] as [number, number],
      ),
    ];
    s = run(s, { type: 'setNoGoZones', playerId: 'host', zones: zone }).state;
    const inside = areaContains(playableAreaOf(s));
    const started = toSpawning(s).state;
    for (const p of started.players) expect(inside(p.spawn ?? { lat: 0, lng: 0 })).toBe(true);
  });

  it('is deterministic for a room seed and differs for another', () => {
    const again = toSpawning(newLobby({ players: 8 })).state;
    expect(again.players.map((p) => p.spawn)).toEqual(spawns);
    const other = toSpawning(newLobby({ players: 8, radarSalt: 'another' })).state;
    expect(other.players.map((p) => p.spawn)).not.toEqual(spawns);
  });

  it('assigns spawns so that total walking is low (nobody walks further than the area is wide)', () => {
    let s = newLobby({ players: 4 });
    // Players stand at the four corners of a square; each should get a spawn, and all are distinct.
    const spots = [
      offsetByMeters(HOME, 100, 100),
      offsetByMeters(HOME, -100, 100),
      offsetByMeters(HOME, 100, -100),
      offsetByMeters(HOME, -100, -100),
    ];
    s.players.forEach((p, i) => {
      s = moveTo(s, p.id, spots[i] ?? HOME, T0);
    });
    const started = toSpawning(s).state;
    for (const p of started.players) {
      expect(distanceM(p.loc ?? HOME, p.spawn ?? HOME)).toBeLessThan(500);
    }
  });
});

describe('spawn failure (E3)', () => {
  it('does not start when the area cannot fit the spawns; everyone is un-readied and told', () => {
    // 8 spawns 400 m apart cannot fit in a 250 m radius circle (a valid setup otherwise).
    const s = newLobby({ players: 8, config: { spawnMinSeparationM: 400 } });
    const ready = readyAll(s);
    expect(ready.countdownEndsAt).toBeDefined();
    // Let the countdown expire.
    const now = T0 + s.config.startCountdownS * S;
    const t = advanceTo(ready, now);
    expect(t.phase).toBe('lobby');
    expect(t.players.every((p) => !p.ready)).toBe(true);
    expect(t.players.every((p) => p.spawn === undefined)).toBe(true);
  });
});

describe('reach detection (RULES §4.3)', () => {
  it('counts a good fix within reachRadiusM, and not one just outside', () => {
    const { state, now } = toSpawning(newLobby({ players: 8 }));
    const p = state.players[1];
    const spawn = p?.spawn ?? HOME;
    const near = offsetByMeters(spawn, DEFAULT_CONFIG.reachRadiusM - 2, 0);
    const far = offsetByMeters(spawn, DEFAULT_CONFIG.reachRadiusM + 5, 0);
    const outside = moveTo(state, 'p1', far, now);
    expect(outside.players.find((x) => x.id === 'p1')?.spawn?.reached).toBe(false);
    const inside = moveTo(state, 'p1', near, now);
    expect(inside.players.find((x) => x.id === 'p1')?.spawn?.reached).toBe(true);
  });

  it('ignores a weak fix even right on the spawn', () => {
    const { state, now } = toSpawning(newLobby({ players: 8 }));
    const spawn = state.players[1]?.spawn ?? HOME;
    const weak = run(
      state,
      { type: 'teleport', playerId: 'p1', lat: spawn.lat, lng: spawn.lng },
      now,
    ).state;
    // A teleport has accuracy 5 (good); send an inaccurate fix on the spawn instead.
    const s2 = run(
      weak,
      { type: 'locUpdate', playerId: 'p2', fix: { ...(state.players[2]?.spawn ?? HOME), accuracy: 80, ts: now } },
      now,
    ).state;
    expect(s2.players.find((x) => x.id === 'p2')?.spawn?.reached).toBe(false);
  });

  it('is sticky: walking away after reaching keeps it reached', () => {
    const { state, now } = toSpawning(newLobby({ players: 8 }));
    const spawn = state.players[1]?.spawn ?? HOME;
    let s = moveTo(state, 'p1', spawn, now);
    s = moveTo(s, 'p1', offsetByMeters(spawn, 100, 0), now + S);
    expect(s.players.find((x) => x.id === 'p1')?.spawn?.reached).toBe(true);
  });
});

describe('spawn phase transitions', () => {
  it('stays in spawning while someone is missing, then reveals when the last one arrives', () => {
    const { state, now } = toSpawning(newLobby({ players: 4 }));
    let s = state;
    for (const p of s.players.slice(0, 3)) s = moveTo(s, p.id, p.spawn ?? HOME, now);
    expect(s.phase).toBe('spawning');
    const last = s.players[3];
    s = moveTo(s, last?.id ?? 'p3', last?.spawn ?? HOME, now + S);
    expect(s.phase).toBe('reveal');
  });

  it('reveals at the spawn timeout even if nobody arrived (E1)', () => {
    const { state, now } = toSpawning(newLobby({ players: 4 }));
    const before = advanceTo(state, now + state.config.spawnTimeoutS * S - S);
    expect(before.phase).toBe('spawning');
    const after = advanceTo(before, now + state.config.spawnTimeoutS * S);
    expect(after.phase).toBe('reveal');
    expect(after.players.every((p) => p.role !== undefined)).toBe(true); // a player who never arrived still gets a role
  });

  it('a disconnected player does not block forever: the timeout still ends the phase (E2)', () => {
    const { state, now } = toSpawning(newLobby({ players: 4 }));
    let s = run(state, { type: 'disconnect', playerId: 'p3' }, now).state;
    for (const p of s.players.filter((x) => x.id !== 'p3')) s = moveTo(s, p.id, p.spawn ?? HOME, now);
    expect(s.phase).toBe('spawning');
    s = advanceTo(s, now + s.config.spawnTimeoutS * S);
    expect(s.phase).toBe('reveal');
  });

  it('a player who leaves mid-spawn no longer counts', () => {
    const { state, now } = toSpawning(newLobby({ players: 5 }));
    let s = run(state, { type: 'leave', playerId: 'p4' }, now).state;
    for (const p of s.players.filter((x) => !x.left)) s = moveTo(s, p.id, p.spawn ?? HOME, now);
    expect(s.phase).toBe('reveal');
    expect(s.players.find((p) => p.id === 'p4')?.role).toBeUndefined();
  });

  it('ends the game when too many players left for a game to make sense', () => {
    const { state, now } = toSpawning(newLobby({ players: 4 }));
    let s = run(state, { type: 'leave', playerId: 'p3' }, now).state;
    s = advanceTo(s, now + s.config.spawnTimeoutS * S);
    expect(s.phase).toBe('ended');
    expect(s.result).toEqual({ winner: null, reason: 'abort' });
  });

  it('rejects an illegal command in the spawn phase with WRONG_PHASE', () => {
    const { state, now } = toSpawning(newLobby({ players: 4 }));
    for (const cmd of [
      { type: 'setReady', playerId: 'p1', ready: true },
      { type: 'updateConfig', playerId: 'host', patch: { playTimeMin: 20 } },
      { type: 'kick', playerId: 'host', targetId: 'p1' },
      { type: 'setBoundary', playerId: 'host', boundary: { type: 'circle', center: HOME, radiusM: 100 } },
      { type: 'pause', playerId: 'host' },
      { type: 'resume', playerId: 'host' },
    ] as const) {
      expect(errCode(reduce(state, cmd, now)), cmd.type).toBe('WRONG_PHASE');
    }
    expect(errCode(reduce(state, { type: 'join', playerId: 'late', username: 'Late' }, now))).toBe(
      'GAME_IN_PROGRESS',
    );
  });
});

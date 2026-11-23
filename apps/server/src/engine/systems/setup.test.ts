import {
  areaContains,
  DEFAULT_CONFIG,
  distanceM,
  type LatLng,
  offsetByMeters,
  playableArea,
  sectionOf,
} from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { reduce, type ReduceResult } from '../reduce';
import { createRoomState, type RoomState } from '../state';
import { tick } from '../tick';
import type { Command } from '../types';
import { projectRegionCounts } from './regionCounts';

const T0 = 1_700_000_000_000;
const S = 1000;
const C = { lat: 28.6139, lng: 77.209 };

type OkResult = Extract<ReduceResult, { ok: true }>;
const ok = (res: ReduceResult): OkResult => {
  if (!res.ok) throw new Error(`expected ok, got ${res.code}: ${res.message}`);
  return res;
};
const fail = (res: ReduceResult) => {
  if (res.ok) throw new Error('expected a rejection');
  return res;
};

function run(s: RoomState, cmd: Command, now = T0): OkResult {
  return ok(reduce(s, cmd, now));
}

function lobby(extra = 3): RoomState {
  let s = createRoomState({
    code: 'ABC234',
    hostId: 'host',
    username: 'Host',
    allowTestMode: true,
    radarSalt: 'salt',
  });
  for (let i = 1; i <= extra; i++) {
    s = run(s, { type: 'join', playerId: `p${i}`, username: `P${i}` }).state;
  }
  return s;
}

const circle = (radiusM: number) => ({ type: 'circle' as const, center: C, radiusM });

function withBoundary(radiusM = 200, extra = 3): RoomState {
  return run(lobby(extra), { type: 'setBoundary', playerId: 'host', boundary: circle(radiusM) })
    .state;
}

function located(s: RoomState, now = T0): RoomState {
  let out = s;
  for (const p of s.players) {
    out = run(
      out,
      { type: 'locUpdate', playerId: p.id, fix: { ...C, accuracy: 5, ts: now } },
      now,
    ).state;
  }
  return out;
}

function readyAll(s: RoomState, now = T0): OkResult {
  let res: OkResult = { ok: true, state: s, effects: [] };
  for (const p of s.players) {
    res = run(res.state, { type: 'setReady', playerId: p.id, ready: true }, now);
  }
  return res;
}

describe('setBoundary lays out the setup (03.2–03.5)', () => {
  const s = withBoundary(200);

  it('makes regions by the auto rule, named A, B, C…', () => {
    // 200 m radius ≈ 125k m² → 3 regions
    expect(s.setup.regions).toHaveLength(3);
    expect(s.setup.regions.map((r) => r.name)).toEqual(['Region A', 'Region B', 'Region C']);
    for (const r of s.setup.regions) expect(r.sections).toHaveLength(9);
  });

  it('fills the pool: points inside the boundary, each labelled by sectionOf', () => {
    expect(s.setup.taskPoints.length).toBeGreaterThan(20);
    const inside = areaContains(playableArea(s.boundary?.ring ?? [], []));
    for (const p of s.setup.taskPoints) {
      expect(inside(p)).toBe(true);
      expect(sectionOf(p, s.setup.regions, DEFAULT_CONFIG.sectionCentreRatio)).toEqual({
        regionId: p.regionId,
        section: p.section,
      });
      expect(p.source).toBe('auto');
    }
  });

  it('puts the default Base on a pool point of the largest region’s middle', () => {
    expect(s.setup.base).toBeDefined();
    expect(s.setup.baseIsDefault).toBe(true);
    const base = s.setup.base as LatLng;
    const onPoint = s.setup.taskPoints.some((p) => distanceM(p, base) < 0.01);
    expect(onPoint).toBe(true);
  });

  it('is deterministic: the same boundary on the same room gives the same layout', () => {
    const again = withBoundary(200);
    expect(again.setup).toEqual(s.setup);
  });

  it('follows the host’s regionCount setting', () => {
    const five = run(s, {
      type: 'updateConfig',
      playerId: 'host',
      patch: { regionCount: 5 },
    }).state;
    expect(five.setup.regions).toHaveLength(5);
    const auto = run(five, {
      type: 'updateConfig',
      playerId: 'host',
      patch: { regionCount: 'auto' },
    }).state;
    expect(auto.setup.regions).toHaveLength(3);
  });
});

describe('lobby:regenerateRegions', () => {
  const s = withBoundary(200);

  it('gives a new layout and un-readies everyone', () => {
    const ready = readyAll(located(s)).state;
    const res = run(ready, { type: 'regenerateRegions', playerId: 'host', input: {} });
    expect(res.state.setup.regions.map((r) => r.area)).not.toEqual(
      s.setup.regions.map((r) => r.area),
    );
    expect(res.state.players.every((p) => !p.ready)).toBe(true);
    expect(res.effects.some((e) => e.kind === 'event' && e.event.type === 'lobby.mapChanged')).toBe(
      true,
    );
  });

  it('honours an explicit seed and region count', () => {
    const a = run(s, {
      type: 'regenerateRegions',
      playerId: 'host',
      input: { regionCount: 4, seed: 99 },
    }).state;
    const b = run(s, {
      type: 'regenerateRegions',
      playerId: 'host',
      input: { regionCount: 4, seed: 99 },
    }).state;
    expect(a.setup.regions).toHaveLength(4);
    expect(a.config.regionCount).toBe(4);
    expect(a.setup).toEqual(b.setup);
  });

  it('is host-only, lobby-only and needs a boundary', () => {
    expect(fail(reduce(s, { type: 'regenerateRegions', playerId: 'p1', input: {} }, T0)).code).toBe(
      'NOT_HOST',
    );
    const regen: Command = { type: 'regenerateRegions', playerId: 'host', input: {} };
    expect(fail(reduce(lobby(), regen, T0)).code).toBe('INVALID_PAYLOAD'); // no boundary yet
    expect(fail(reduce({ ...s, phase: 'starting' }, regen, T0)).code).toBe('WRONG_PHASE');
  });
});

describe('lobby:renameRegion', () => {
  const s = withBoundary(200);

  it('renames, keeps the name when only the points change, and un-readies', () => {
    const renamed = run(readyAll(located(s)).state, {
      type: 'renameRegion',
      playerId: 'host',
      regionId: 'r2',
      name: 'The Quad',
    });
    expect(renamed.state.setup.regions[1]?.name).toBe('The Quad');
    expect(renamed.state.players.every((p) => !p.ready)).toBe(true);
    const regen = run(renamed.state, {
      type: 'editTaskPoints',
      playerId: 'host',
      input: { regenerate: true },
    }).state;
    expect(regen.setup.regions[1]?.name).toBe('The Quad');
  });

  it('an unchanged name is a no-op, an unknown region is NOT_FOUND, a guest is NOT_HOST', () => {
    const ready = readyAll(located(s)).state;
    const same = run(ready, {
      type: 'renameRegion',
      playerId: 'host',
      regionId: 'r1',
      name: 'Region A',
    });
    expect(same.state.players.every((p) => p.ready)).toBe(true);
    expect(
      fail(reduce(s, { type: 'renameRegion', playerId: 'host', regionId: 'zz', name: 'X' }, T0))
        .code,
    ).toBe('NOT_FOUND');
    expect(
      fail(reduce(s, { type: 'renameRegion', playerId: 'p1', regionId: 'r1', name: 'X' }, T0)).code,
    ).toBe('NOT_HOST');
  });

  it('a new layout resets the names', () => {
    const renamed = run(s, {
      type: 'renameRegion',
      playerId: 'host',
      regionId: 'r1',
      name: 'Old Gym',
    }).state;
    const regen = run(renamed, { type: 'regenerateRegions', playerId: 'host', input: {} }).state;
    expect(regen.setup.regions[0]?.name).toBe('Region A');
  });
});

describe('lobby:editTaskPoints (03.4)', () => {
  const s = withBoundary(200);
  const inside = offsetByMeters(C, 20, 30);

  it('adds a host point with its region and section computed by the server', () => {
    const res = run(s, {
      type: 'editTaskPoints',
      playerId: 'host',
      input: { add: [inside] },
    });
    const added = res.state.setup.taskPoints.at(-1);
    expect(added?.source).toBe('host');
    expect(added).toMatchObject(
      sectionOf(inside, res.state.setup.regions, DEFAULT_CONFIG.sectionCentreRatio) ?? {},
    );
    expect(res.state.setup.taskPoints).toHaveLength(s.setup.taskPoints.length + 1);
  });

  it('rejects a point outside the boundary, and adds nothing from that call', () => {
    const outside = offsetByMeters(C, 500, 0);
    const res = fail(
      reduce(
        s,
        { type: 'editTaskPoints', playerId: 'host', input: { add: [inside, outside] } },
        T0,
      ),
    );
    expect(res.code).toBe('INVALID_PAYLOAD');
    expect(res.message).toMatch(/inside the boundary/);
  });

  it('removes points by id (unknown ids are ignored) and un-readies only on a real change', () => {
    const ready = readyAll(located(s)).state;
    const target = s.setup.taskPoints[3]?.id ?? '';
    const res = run(ready, {
      type: 'editTaskPoints',
      playerId: 'host',
      input: { remove: [target, 'nope'] },
    });
    expect(res.state.setup.taskPoints.some((p) => p.id === target)).toBe(false);
    expect(res.state.players.every((p) => !p.ready)).toBe(true);
    const noop = run(ready, {
      type: 'editTaskPoints',
      playerId: 'host',
      input: { remove: ['nope'] },
    });
    expect(noop.state.players.every((p) => p.ready)).toBe(true);
  });

  it('regenerate replaces the auto points, keeps host points and ids stay unique', () => {
    const withHost = run(s, {
      type: 'editTaskPoints',
      playerId: 'host',
      input: { add: [inside] },
    }).state;
    const hostPoint = withHost.setup.taskPoints.find((p) => p.source === 'host');
    const regen = run(withHost, {
      type: 'editTaskPoints',
      playerId: 'host',
      input: { regenerate: true },
    }).state;
    expect(regen.setup.taskPoints.find((p) => p.id === hostPoint?.id)).toBeDefined();
    const autos = (st: RoomState) => st.setup.taskPoints.filter((p) => p.source === 'auto');
    expect(autos(regen).map((p) => [p.lat, p.lng])).not.toEqual(
      autos(withHost).map((p) => [p.lat, p.lng]),
    );
    const ids = regen.setup.taskPoints.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('lobby:setNoGoZones (03.5)', () => {
  const s = withBoundary(200);
  // A 40 m wide band through the middle of the circle.
  const band = [
    offsetByMeters(C, -30, -250),
    offsetByMeters(C, 10, -250),
    offsetByMeters(C, 10, 250),
    offsetByMeters(C, -30, 250),
  ].map((p) => [p.lng, p.lat] as [number, number]);

  it('removes pool points inside the zone and keeps regions out of it', () => {
    const res = run(s, { type: 'setNoGoZones', playerId: 'host', zones: [band] });
    const after = res.state;
    expect(after.setup.noGo).toHaveLength(1);
    expect(after.setup.noGo[0]?.[0]).toEqual(after.setup.noGo[0]?.at(-1)); // closed
    const inZone = areaContains([[after.setup.noGo[0] ?? []]]);
    expect(after.setup.taskPoints.some((p) => inZone(p))).toBe(false);
    expect(after.setup.taskPoints.length).toBeLessThan(s.setup.taskPoints.length);
    const middle = offsetByMeters(C, -10, 0);
    expect(sectionOf(middle, after.setup.regions, DEFAULT_CONFIG.sectionCentreRatio)).toBeNull();
    expect(res.state.players.every((p) => !p.ready)).toBe(true);
  });

  it('refuses a self-crossing or too-small zone with a readable message', () => {
    const bowtie: [number, number][] = [
      [C.lng, C.lat],
      [C.lng + 0.001, C.lat + 0.001],
      [C.lng + 0.001, C.lat],
      [C.lng, C.lat + 0.001],
    ];
    expect(
      fail(reduce(s, { type: 'setNoGoZones', playerId: 'host', zones: [bowtie] }, T0)).message,
    ).toMatch(/crosses itself/);
    const line: [number, number][] = [
      [C.lng, C.lat],
      [C.lng + 0.001, C.lat],
      [C.lng, C.lat],
    ];
    expect(
      fail(reduce(s, { type: 'setNoGoZones', playerId: 'host', zones: [line] }, T0)).message,
    ).toMatch(/at least 3 corners/);
  });

  it('moves the default Base out of a zone, and a host Base survives unless the zone covers it', () => {
    const base = s.setup.base as LatLng;
    const cover = [
      offsetByMeters(base, -15, -15),
      offsetByMeters(base, 15, -15),
      offsetByMeters(base, 15, 15),
      offsetByMeters(base, -15, 15),
    ].map((p) => [p.lng, p.lat] as [number, number]);
    const moved = run(s, { type: 'setNoGoZones', playerId: 'host', zones: [cover] }).state;
    const inCover = areaContains([[moved.setup.noGo[0] ?? []]]);
    expect(inCover(moved.setup.base as LatLng)).toBe(false);

    const placed = run(s, {
      type: 'setBase',
      playerId: 'host',
      base: offsetByMeters(C, 100, 100),
    }).state;
    const kept = run(placed, { type: 'setNoGoZones', playerId: 'host', zones: [band] }).state;
    expect(kept.setup.base).toEqual(placed.setup.base);
    expect(kept.setup.baseIsDefault).toBe(false);
  });

  it('the same zones again are a no-op (nobody is un-readied)', () => {
    const first = run(s, { type: 'setNoGoZones', playerId: 'host', zones: [band] }).state;
    const ready = readyAll(located(first)).state;
    const again = run(ready, { type: 'setNoGoZones', playerId: 'host', zones: [band] });
    expect(again.state.players.every((p) => p.ready)).toBe(true);
  });

  it('clearing the zones brings the ground back into the regions', () => {
    const zoned = run(s, { type: 'setNoGoZones', playerId: 'host', zones: [band] }).state;
    const cleared = run(zoned, { type: 'setNoGoZones', playerId: 'host', zones: [] }).state;
    const middle = offsetByMeters(C, -10, 0);
    expect(
      sectionOf(middle, cleared.setup.regions, DEFAULT_CONFIG.sectionCentreRatio),
    ).not.toBeNull();
  });
});

describe('lobby:setBase', () => {
  const s = withBoundary(200);

  it('stores a Base inside the boundary and keeps it across a new boundary only if still inside', () => {
    const spot = offsetByMeters(C, 60, -40);
    const placed = run(s, { type: 'setBase', playerId: 'host', base: spot }).state;
    expect(placed.setup.base).toEqual({ lat: spot.lat, lng: spot.lng });
    expect(placed.setup.baseIsDefault).toBe(false);
    const bigger = run(placed, { type: 'setBoundary', playerId: 'host', boundary: circle(250) });
    expect(bigger.state.setup.base).toEqual(placed.setup.base);
    const far = run(placed, {
      type: 'setBoundary',
      playerId: 'host',
      boundary: { type: 'circle', center: offsetByMeters(C, 600, 0), radiusM: 200 },
    });
    expect(far.state.setup.baseIsDefault).toBe(true);
    expect(far.state.setup.base).not.toEqual(placed.setup.base);
  });

  it('rejects a Base outside the boundary or inside a no-go zone', () => {
    const outside = fail(
      reduce(s, { type: 'setBase', playerId: 'host', base: offsetByMeters(C, 500, 0) }, T0),
    );
    expect(outside.code).toBe('INVALID_PAYLOAD');
    const zone = [
      offsetByMeters(C, 40, 40),
      offsetByMeters(C, 80, 40),
      offsetByMeters(C, 80, 80),
      offsetByMeters(C, 40, 80),
    ].map((p) => [p.lng, p.lat] as [number, number]);
    const zoned = run(s, { type: 'setNoGoZones', playerId: 'host', zones: [zone] }).state;
    expect(
      fail(
        reduce(zoned, { type: 'setBase', playerId: 'host', base: offsetByMeters(C, 60, 60) }, T0),
      ).code,
    ).toBe('INVALID_PAYLOAD');
  });
});

describe('setup validation blocks the start (03.6, RULES E39)', () => {
  function startable(): RoomState {
    return located(withBoundary(200, 3)); // 4 players need 16 usable points
  }

  it('starts the countdown when everything is valid and everyone is ready', () => {
    const res = readyAll(startable());
    expect(res.state.countdownEndsAt).toBeDefined();
  });

  it('does not start without enough usable points, and un-readies on every setup change', () => {
    let s = startable();
    const ids = s.setup.taskPoints.map((p) => p.id);
    s = run(s, {
      type: 'editTaskPoints',
      playerId: 'host',
      input: { remove: ids.slice(10) },
    }).state;
    expect(s.setup.taskPoints.length).toBe(10);
    const res = readyAll(s);
    expect(res.state.countdownEndsAt).toBeUndefined();
    // Adding points back un-readies everyone but then the host can ready again and start.
    const back = run(res.state, {
      type: 'editTaskPoints',
      playerId: 'host',
      input: { regenerate: true },
    }).state;
    expect(back.players.every((p) => !p.ready)).toBe(true);
    expect(readyAll(back).state.countdownEndsAt).toBeDefined();
  });

  it('cancels a running countdown when a setup change makes the setup invalid', () => {
    const running = readyAll(startable()).state;
    expect(running.countdownEndsAt).toBeDefined();
    const res = run(running, { type: 'regenerateRegions', playerId: 'host', input: {} });
    expect(res.state.countdownEndsAt).toBeUndefined();
    expect(
      res.effects.some((e) => e.kind === 'event' && e.event.type === 'lobby.countdownCancelled'),
    ).toBe(true);
  });

  it('does not start with all points in one region', () => {
    let s = startable();
    const keep = s.setup.regions[0]?.id;
    const remove = s.setup.taskPoints.filter((p) => p.regionId !== keep).map((p) => p.id);
    s = run(s, { type: 'editTaskPoints', playerId: 'host', input: { remove } }).state;
    expect(s.setup.taskPoints.length).toBeGreaterThanOrEqual(16);
    expect(readyAll(s).state.countdownEndsAt).toBeUndefined();
  });
});

describe('region counts (03.7)', () => {
  const REFRESH = DEFAULT_CONFIG.regionCountRefreshS * S;

  function place(s: RoomState, id: string, at: LatLng, now: number): RoomState {
    const withTest = { ...s, config: { ...s.config, testMode: true } };
    return run(withTest, { type: 'teleport', playerId: id, lat: at.lat, lng: at.lng }, now).state;
  }

  it('buckets 0, 1, 2–3 and 4+ per region, refreshed only every regionCountRefreshS', () => {
    let s = withBoundary(200, 5); // 6 players
    const [rA, rB] = s.setup.regions;
    const spotA = rA?.origin as LatLng;
    const spotB = rB?.origin as LatLng;
    for (const id of ['host', 'p1', 'p2', 'p3']) s = place(s, id, spotA, T0);
    s = place(s, 'p4', spotB, T0);
    s = tick(s, T0).state;
    const counts = (viewer: string, now: number) =>
      Object.fromEntries(projectRegionCounts(s, viewer, now).map((c) => [c.regionId, c.bucket]));
    expect(counts('p4', T0)).toMatchObject({ [rA?.id ?? '']: '4+', [rB?.id ?? '']: '1' });

    // A player walks from A to B: others keep seeing the old counts until the refresh.
    s = place(s, 'p3', spotB, T0 + 5 * S);
    s = tick(s, T0 + 5 * S).state;
    expect(counts('host', T0 + 5 * S)[rA?.id ?? '']).toBe('4+'); // snapshot still has p3 in A
    // Everyone keeps reporting (so nobody goes stale); the next snapshot then shows p3 in B.
    const refresh = T0 + REFRESH + 1;
    for (const id of ['host', 'p1', 'p2']) s = place(s, id, spotA, refresh);
    for (const id of ['p3', 'p4']) s = place(s, id, spotB, refresh);
    s = tick(s, refresh).state;
    expect(counts('host', refresh)[rA?.id ?? '']).toBe('2–3');
    expect(counts('host', refresh)[rB?.id ?? '']).toBe('2–3');
  });

  it('always counts the viewer in their own current region, even before the next refresh', () => {
    let s = withBoundary(200, 3);
    const [rA, rB] = s.setup.regions;
    s = place(s, 'host', rA?.origin as LatLng, T0);
    s = tick(s, T0).state;
    s = place(s, 'p1', rB?.origin as LatLng, T0 + 2 * S);
    const view = Object.fromEntries(
      projectRegionCounts(s, 'p1', T0 + 2 * S).map((c) => [c.regionId, c.bucket]),
    );
    expect(view[rB?.id ?? '']).toBe('1'); // p1 sees themselves although the snapshot predates them
    const other = Object.fromEntries(
      projectRegionCounts(s, 'host', T0 + 2 * S).map((c) => [c.regionId, c.bucket]),
    );
    expect(other[rB?.id ?? '']).toBe('0'); // host still sees the old snapshot
  });

  it('leaves out stale players and players without a fix', () => {
    let s = withBoundary(200, 3);
    const rA = s.setup.regions[0];
    s = place(s, 'host', rA?.origin as LatLng, T0);
    s = place(s, 'p1', rA?.origin as LatLng, T0);
    const later = T0 + (DEFAULT_CONFIG.staleAfterS + 1) * S;
    s = place(s, 'p2', rA?.origin as LatLng, later); // fresh; host and p1 are now stale
    s = tick(s, later).state;
    const bucket = projectRegionCounts(s, 'p3', later).find((c) => c.regionId === rA?.id)?.bucket;
    expect(bucket).toBe('1'); // only p2 counts (p3 has no fix)
  });
});

import { DEFAULT_CONFIG, offsetByMeters } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { reduce } from '../engine/reduce';
import type { RoomState } from '../engine/state';
import { buildLobbyFixture } from './leakHarness';
import { buildRadar } from './radar';

const T0 = 1_700_000_000_000;
const S = 1000;
const HOME = { lat: 28.6139, lng: 77.209 };
const ROTATE_MS = DEFAULT_CONFIG.dotAliasRotateS * S;

function place(state: RoomState, id: string, eastM: number, now = T0, accuracy = 6): RoomState {
  const res = reduce(
    state,
    {
      type: 'locUpdate',
      playerId: id,
      fix: { ...offsetByMeters(HOME, eastM, 0), accuracy, ts: now },
    },
    now,
  );
  if (!res.ok) throw new Error(res.code);
  return res.state;
}

function fixture(n = 4) {
  let { state } = buildLobbyFixture({ players: n });
  state = place(state, 'p0', 0);
  state = place(state, 'p1', 10);
  state = place(state, 'p2', 20);
  state = place(state, 'p3', 30);
  return state;
}

describe('buildRadar (MAP_AND_REGIONS §6, lobby: every other player)', () => {
  it('shows every other located player and never the viewer', () => {
    const dots = buildRadar(fixture(), 'p0', T0);
    expect(dots).toHaveLength(3);
    const lngs = dots.map((d) => d.lng);
    expect(lngs).not.toContain(offsetByMeters(HOME, 0, 0).lng);
  });

  it('skips players with no fix and players who are offline', () => {
    let s = fixture();
    const p3 = s.players.find((p) => p.id === 'p3');
    if (p3) p3.connected = false;
    delete s.players.find((p) => p.id === 'p2')?.loc;
    s = structuredClone(s);
    expect(buildRadar(s, 'p0', T0)).toHaveLength(1);
  });

  it('dots carry only alias, position and flags: no id or name', () => {
    for (const d of buildRadar(fixture(), 'p0', T0)) {
      expect(Object.keys(d).sort()).toEqual(['alias', 'flags', 'lat', 'lng']);
      expect(JSON.stringify(d)).not.toMatch(/p[0-3]\b|Player/);
    }
  });

  it('aliases differ per viewer for the same person', () => {
    const s = fixture();
    const forP0 = buildRadar(s, 'p0', T0).find((d) => d.lng === offsetByMeters(HOME, 10, 0).lng);
    const forP2 = buildRadar(s, 'p2', T0).find((d) => d.lng === offsetByMeters(HOME, 10, 0).lng);
    expect(forP0?.alias).toBeDefined();
    expect(forP0?.alias).not.toBe(forP2?.alias);
  });

  it('aliases are stable within a rotation window and change after it', () => {
    const s = fixture();
    const a = buildRadar(s, 'p0', T0).map((d) => d.alias);
    const b = buildRadar(s, 'p0', T0 + 5 * S).map((d) => d.alias);
    const epochStart = Math.floor(T0 / ROTATE_MS) * ROTATE_MS;
    const c = buildRadar(s, 'p0', epochStart + ROTATE_MS + 1).map((d) => d.alias);
    expect(b).toEqual(a);
    expect(c.sort()).not.toEqual([...a].sort());
  });

  it('aliases depend on the room salt (not derivable from ids alone)', () => {
    const s1 = fixture();
    const s2 = { ...fixture(), radarSalt: 'another-salt' };
    expect(buildRadar(s1, 'p0', T0).map((d) => d.alias)).not.toEqual(
      buildRadar(s2, 'p0', T0).map((d) => d.alias),
    );
  });

  it('aliases are unique within one radar frame', () => {
    const { state } = buildLobbyFixture({ players: 12 });
    let s = state;
    for (let i = 0; i < 12; i++) s = place(s, `p${i}`, i * 5);
    const aliases = buildRadar(s, 'p0', T0).map((d) => d.alias);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it('does not reveal join order: dots are sorted by alias', () => {
    const aliases = buildRadar(fixture(), 'p0', T0).map((d) => d.alias);
    expect(aliases).toEqual([...aliases].sort());
  });

  it('flags stale dots (no fix for staleAfterS) and out-of-bounds dots', () => {
    let s = fixture();
    const res = reduce(
      s,
      {
        type: 'setBoundary',
        playerId: 'p0',
        boundary: { type: 'circle', center: offsetByMeters(HOME, 15, 0), radiusM: 100 },
      },
      T0,
    );
    if (!res.ok) throw new Error(res.code);
    s = place(res.state, 'p3', 150, T0 + 20 * S); // fresh, outside the circle
    const dots = buildRadar(s, 'p0', T0 + 20 * S);
    const byLng = new Map(dots.map((d) => [d.lng, d.flags]));
    // p1 (10 m) and p2 (20 m) have not sent since T0 → stale; both inside the circle.
    expect(byLng.get(offsetByMeters(HOME, 10, 0).lng)).toEqual(['stale']);
    // p3 is fresh but 135 m from the circle's centre (radius 100).
    expect(byLng.get(offsetByMeters(HOME, 150, 0).lng)).toEqual(['oob']);
  });

  it('shows weak-accuracy dots without a flag (only stale and oob are public)', () => {
    let s = fixture();
    s = place(s, 'p1', 10, T0, DEFAULT_CONFIG.maxAccuracyM + 20);
    const d = buildRadar(s, 'p0', T0).find((x) => x.lng === offsetByMeters(HOME, 10, 0).lng);
    expect(d?.flags).toEqual([]);
  });
});

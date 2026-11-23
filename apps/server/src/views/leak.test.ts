/**
 * Leak tests (TESTING.md §3), mandatory from Phase 1. Extend these whenever a
 * view gains a field: add the path to ALLOWED_VIEW_KEYS and assert who may see it.
 */
import { sectionOf } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import {
  ALLOWED_VIEW_KEYS,
  buildLobbyFixture,
  FIXTURE_NOW,
  FORBIDDEN_KEY_NAMES,
  keysDeep,
} from './leakHarness';
import { projectView } from './projectView';
import { buildRadar } from './radar';

const NOW = FIXTURE_NOW;

/** The number as a whole JSON token (so 28.6139 doesn't match inside 28.61391234). */
const exactNumber = (n: number) =>
  new RegExp(`(^|[^\\d.])${String(n).replace('.', '\\.')}($|[^\\d])`);

const fixtures = {
  fresh: buildLobbyFixture({ players: 4 }),
  countdown: buildLobbyFixture({
    players: 6,
    readyIds: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
    countdownEndsAt: 123,
  }),
  mixed: buildLobbyFixture({ players: 12, readyIds: ['p1', 'p4'], disconnectedIds: ['p2', 'p0'] }),
  located: buildLobbyFixture({ players: 8, located: true }),
  laidOut: buildLobbyFixture({ players: 8, located: true, layout: true }),
};

describe.each(Object.entries(fixtures))('leak: %s lobby', (_name, { state, tokens }) => {
  const views = state.players.map((p) => ({ id: p.id, view: projectView(state, p.id, NOW) }));

  it('no view ever contains a session token (anyone’s)', () => {
    for (const { view } of views) {
      const json = JSON.stringify(view);
      for (const token of tokens.values()) expect(json).not.toContain(token);
    }
  });

  it('views contain only allow-listed key paths (config keys checked separately)', () => {
    for (const { view } of views) {
      const keys = keysDeep(view).filter((k) => !k.startsWith('lobby.config.'));
      for (const k of keys) expect(ALLOWED_VIEW_KEYS, `unexpected key ${k}`).toContain(k);
    }
  });

  it('no forbidden key name appears at any depth', () => {
    for (const { view } of views) {
      const names = new Set(keysDeep(view).map((k) => k.split('.').pop()?.replace('[]', '')));
      for (const bad of FORBIDDEN_KEY_NAMES) expect(names.has(bad), bad).toBe(false);
    }
  });

  it('the host’s view has the same structure as everyone else’s (no host powers in data)', () => {
    const hostKeys = keysDeep(views.find((v) => v.id === state.hostId)?.view);
    for (const { view } of views) expect(keysDeep(view)).toEqual(hostKeys);
  });

  it('a view never contains another player’s coordinates (only me.location is theirs)', () => {
    for (const { id, view } of views) {
      const json = JSON.stringify(view);
      for (const other of state.players) {
        if (other.id === id || !other.loc) continue;
        expect(json, `${id} sees ${other.id}'s lat`).not.toMatch(exactNumber(other.loc.lat));
        expect(json, `${id} sees ${other.id}'s lng`).not.toMatch(exactNumber(other.loc.lng));
      }
    }
  });

  it('me.location, when present, is the viewer’s own fix', () => {
    for (const { id, view } of views) {
      const mine = state.players.find((p) => p.id === id)?.loc;
      if (!mine) expect(view.me.location).toBeUndefined();
      else expect(view.me.location).toMatchObject({ lat: mine.lat, lng: mine.lng });
    }
  });

  it('radar frames carry no player id, username, token or room salt', () => {
    for (const { id } of views) {
      const frame = JSON.stringify({ dots: buildRadar(state, id, NOW), at: NOW });
      for (const p of state.players) {
        expect(frame).not.toContain(`"${p.id}"`);
        expect(frame).not.toContain(p.username);
      }
      for (const token of tokens.values()) expect(frame).not.toContain(token);
      expect(frame).not.toContain(state.radarSalt);
    }
  });

  it('radar dots have the same shape for every viewer and never include the viewer', () => {
    for (const { id } of views) {
      const dots = buildRadar(state, id, NOW);
      expect(dots.length).toBeLessThanOrEqual(state.players.length - 1);
      for (const d of dots) expect(Object.keys(d).sort()).toEqual(['alias', 'flags', 'lat', 'lng']);
      const own = state.players.find((p) => p.id === id)?.loc;
      if (own) expect(dots.some((d) => d.lat === own.lat && d.lng === own.lng)).toBe(false);
    }
  });

  it('the roster is identical for every viewer (public data only)', () => {
    const first = JSON.stringify(views[0]?.view.lobby);
    for (const { view } of views) expect(JSON.stringify(view.lobby)).toBe(first);
  });
});

describe('leak: setup, region counts and the task pool (Phase 3)', () => {
  const { state } = buildLobbyFixture({ players: 8, located: true, layout: true });
  const views = state.players.map((p) => ({ id: p.id, view: projectView(state, p.id, NOW) }));
  const labels = new Set(state.config.regionCountBuckets.map((b) => b.label));

  it('the fixture really has regions, points and a Base', () => {
    expect(state.setup.regions.length).toBeGreaterThanOrEqual(2);
    expect(state.setup.taskPoints.length).toBeGreaterThan(20);
    expect(state.setup.base).toBeDefined();
  });

  it('setup is identical for every viewer (public data only)', () => {
    const first = JSON.stringify(views[0]?.view.lobby.map);
    for (const { view } of views) expect(JSON.stringify(view.lobby.map)).toBe(first);
  });

  it('region counts are bucket labels (never exact numbers) and never carry player ids', () => {
    for (const { view } of views) {
      expect(view.game?.regionCounts).toHaveLength(state.setup.regions.length);
      for (const c of view.game?.regionCounts ?? []) {
        expect(Object.keys(c).sort()).toEqual(['bucket', 'regionId']);
        expect(labels.has(c.bucket)).toBe(true);
      }
    }
    const json = JSON.stringify(views.map((v) => v.view.game));
    for (const p of state.players) expect(json).not.toContain(p.id);
  });

  it('a viewer is counted in their own region', () => {
    for (const { id, view } of views) {
      const me = state.players.find((p) => p.id === id);
      const mine = sectionOf(
        me?.loc ?? { lat: 0, lng: 0 },
        state.setup.regions,
        state.config.sectionCentreRatio,
      );
      const bucket = view.game?.regionCounts.find((c) => c.regionId === mine?.regionId)?.bucket;
      expect(bucket, id).toBeDefined();
      expect(bucket).not.toBe('0');
    }
  });

  it('the task pool is hidden once the lobby is over (the pin points are secret during play)', () => {
    const started = structuredClone(state);
    started.phase = 'spawning';
    for (const p of started.players) {
      expect(projectView(started, p.id, NOW).lobby.map.taskPoints).toEqual([]);
    }
    expect(projectView(state, 'p1', NOW).lobby.map.taskPoints.length).toBeGreaterThan(0);
  });

  it('no task-point or Base field leaks a username or token (point ids look like p1, as do the fixture’s player ids)', () => {
    const { tokens } = buildLobbyFixture({ players: 8, located: true, layout: true });
    const json = JSON.stringify(views.map((v) => v.view.lobby.map));
    for (const p of state.players) expect(json).not.toContain(p.username);
    for (const token of tokens.values()) expect(json).not.toContain(token);
    expect(json).not.toContain('playerId');
  });

  describe.each(['nearby', 'regions', 'all'] as const)('radar in %s mode', (mode) => {
    const s = structuredClone(state);
    s.config.playerVisibility = mode;
    it('keeps dot flags public-only and the dot shape fixed', () => {
      for (const p of s.players) {
        for (const d of buildRadar(s, p.id, NOW)) {
          expect(Object.keys(d).sort()).toEqual(['alias', 'flags', 'lat', 'lng']);
          for (const f of d.flags) expect(['oob', 'stale']).toContain(f);
        }
      }
    });
  });

  it('regions mode shows no dots at all', () => {
    const s = structuredClone(state);
    s.config.playerVisibility = 'regions';
    for (const p of s.players) expect(buildRadar(s, p.id, NOW)).toEqual([]);
  });
});

describe('keysDeep', () => {
  it('collapses array items and sorts paths', () => {
    expect(keysDeep({ b: [{ x: 1 }, { y: 2 }], a: { c: null } })).toEqual([
      'a',
      'a.c',
      'b',
      'b[].x',
      'b[].y',
    ]);
  });
});

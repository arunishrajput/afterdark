/**
 * Leak tests (TESTING.md §3), mandatory from Phase 1. Extend these whenever a
 * view gains a field: add the path to ALLOWED_VIEW_KEYS and assert who may see it.
 */
import { describe, expect, it } from 'vitest';

import { buildLobbyFixture, FORBIDDEN_KEY_NAMES, keysDeep } from './leakHarness';
import { projectView } from './projectView';

/** Every key path a Phase 1 view may contain. Anything else fails the test. */
const ALLOWED_VIEW_KEYS = new Set([
  'lobby',
  'lobby.code',
  'lobby.phase',
  'lobby.hostId',
  'lobby.testMode',
  'lobby.config',
  'lobby.players',
  'lobby.players[].id',
  'lobby.players[].username',
  'lobby.players[].isHost',
  'lobby.players[].ready',
  'lobby.players[].connected',
  'lobby.players[].status',
  'lobby.countdownEndsAt',
  'me',
  'me.id',
  'me.username',
  'me.isHost',
  'me.ready',
  'me.status',
]);

const fixtures = {
  fresh: buildLobbyFixture({ players: 4 }),
  countdown: buildLobbyFixture({
    players: 6,
    readyIds: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
    countdownEndsAt: 123,
  }),
  mixed: buildLobbyFixture({ players: 12, readyIds: ['p1', 'p4'], disconnectedIds: ['p2', 'p0'] }),
};

describe.each(Object.entries(fixtures))('leak: %s lobby', (_name, { state, tokens }) => {
  const views = state.players.map((p) => ({ id: p.id, view: projectView(state, p.id) }));

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

  it('the roster is identical for every viewer (public data only)', () => {
    const first = JSON.stringify(views[0]?.view.lobby);
    for (const { view } of views) expect(JSON.stringify(view.lobby)).toBe(first);
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

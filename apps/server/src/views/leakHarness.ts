/**
 * Leak-test helpers (TESTING.md §3). Used by `leak.test.ts` and by integration
 * tests that scan raw socket frames. Test-only: production code never imports it.
 */
import { offsetByMeters, toPosition } from '@afterdark/shared';

import { createRoomState, type RoomState } from '../engine/state';
import { SessionRegistry } from '../rooms/sessions';

/**
 * Every key path in a JSON-like value, sorted and de-duplicated. Array items
 * collapse to `[]`, so `lobby.players[].id` stands for every roster entry.
 */
export function keysDeep(value: unknown, prefix = ''): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) {
      for (const item of v) walk(item, `${path}[]`);
    } else if (v !== null && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) {
        const p = path ? `${path}.${k}` : k;
        out.add(p);
        walk(child, p);
      }
    }
  };
  walk(value, prefix);
  return [...out].sort();
}

/** Key names that must never appear in a view, at any depth, before Phase 4 adds roles. */
export const FORBIDDEN_KEY_NAMES = [
  'token',
  'role',
  'imposter',
  'tag',
  'classes',
  'infected',
  'exposed',
  'compromisedIds',
  'incubation',
  'disconnectedAt',
  'left',
] as const;

export interface LobbyFixture {
  state: RoomState;
  /** Session token per player id (tokens never live in RoomState). */
  tokens: Map<string, string>;
}

export interface LobbyFixtureOptions {
  players?: number;
  readyIds?: readonly string[];
  disconnectedIds?: readonly string[];
  countdownEndsAt?: number;
  /** Everyone has a fix (player `i` stands `10·i` m east of HOME) and the host has a 150 m boundary. */
  located?: boolean;
}

export const FIXTURE_NOW = 1_700_000_000_000;
export const FIXTURE_HOME = { lat: 28.6139, lng: 77.209 };

/** A lobby with host `p0` and players `p1…p(n-1)`, with sessions issued for everyone. */
export function buildLobbyFixture(opts: LobbyFixtureOptions = {}): LobbyFixture {
  const count = opts.players ?? 4;
  const sessions = new SessionRegistry();
  const state = createRoomState({
    code: 'ABC234',
    hostId: 'p0',
    username: 'Player 0',
    allowTestMode: true,
    radarSalt: 'test-salt',
  });
  for (let i = 1; i < count; i++) {
    state.players.push({ id: `p${i}`, username: `Player ${i}`, ready: false, connected: true });
  }
  for (const p of state.players) {
    if (opts.readyIds?.includes(p.id)) p.ready = true;
    if (opts.disconnectedIds?.includes(p.id)) {
      p.connected = false;
      p.disconnectedAt = 0;
    }
  }
  if (opts.countdownEndsAt !== undefined) state.countdownEndsAt = opts.countdownEndsAt;
  if (opts.located) {
    const centre = offsetByMeters(FIXTURE_HOME, 37, 41); // off the players' coordinates, so no number collides
    const ring = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * 2 * Math.PI;
      return toPosition(offsetByMeters(centre, 150 * Math.cos(a), 150 * Math.sin(a)));
    });
    state.boundary = { ring: [...ring, ring[0] as (typeof ring)[number]], areaM2: 60000 };
    state.players.forEach((p, i) => {
      const at = offsetByMeters(FIXTURE_HOME, 10 * i, 3 * i);
      p.loc = {
        lat: at.lat,
        lng: at.lng,
        accuracy: 6 + i,
        ts: FIXTURE_NOW,
        receivedAt: FIXTURE_NOW,
      };
    });
  }
  const tokens = new Map(state.players.map((p) => [p.id, sessions.issue(state.code, p.id)]));
  return { state, tokens };
}

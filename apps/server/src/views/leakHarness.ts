/**
 * Leak-test helpers (TESTING.md §3). Used by `leak.test.ts` and by integration
 * tests that scan raw socket frames. Test-only: production code never imports it.
 */
import { offsetByMeters, toPosition } from '@afterdark/shared';

import { createRoomState, type RoomState } from '../engine/state';
import { applyLayout } from '../engine/systems/layout';
import { refreshRegionCounts } from '../engine/systems/regionCounts';
import { newLobby, run, T0, toPlaying, toReveal, toSpawning } from '../engine/testkit';
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

/** Every key path a view may contain (through Phase 5). Anything else fails the test. */
export const ALLOWED_VIEW_KEYS = new Set([
  'lobby',
  'lobby.code',
  'lobby.phase',
  'lobby.hostId',
  'lobby.testMode',
  'lobby.config',
  'lobby.map',
  'lobby.map.boundary',
  'lobby.map.boundary.ring',
  'lobby.map.boundary.areaM2',
  'lobby.map.regions',
  'lobby.map.regions[].id',
  'lobby.map.regions[].name',
  'lobby.map.regions[].area',
  'lobby.map.regions[].origin',
  'lobby.map.regions[].origin.lat',
  'lobby.map.regions[].origin.lng',
  'lobby.map.regions[].rhoM',
  'lobby.map.regions[].areaM2',
  'lobby.map.regions[].sections',
  'lobby.map.regions[].sections[].id',
  'lobby.map.regions[].sections[].areaM2',
  'lobby.map.regions[].sections[].usable',
  'lobby.map.taskPoints',
  'lobby.map.taskPoints[].id',
  'lobby.map.taskPoints[].lat',
  'lobby.map.taskPoints[].lng',
  'lobby.map.taskPoints[].regionId',
  'lobby.map.taskPoints[].section',
  'lobby.map.taskPoints[].source',
  'lobby.map.noGo',
  'lobby.map.base',
  'lobby.map.base.lat',
  'lobby.map.base.lng',
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
  'me.location',
  'me.location.lat',
  'me.location.lng',
  'me.location.accuracy',
  'me.location.quality',
  'me.location.oob',
  'game',
  'game.regionCounts',
  'game.regionCounts[].regionId',
  'game.regionCounts[].bucket',
  // Phase 4: the viewer's own spawn, tag, role, zone and score; the public game numbers.
  'me.spawn',
  'me.spawn.lat',
  'me.spawn.lng',
  'me.spawn.reached',
  'me.tag',
  'me.role',
  'me.imposter',
  'me.imposter.classes',
  'me.imposter.allies',
  'me.imposter.allies[].playerId',
  'me.imposter.allies[].username',
  'me.imposter.allies[].tag',
  'me.imposter.allies[].classes',
  'me.personalScore',
  'me.zone',
  'me.zone.oob',
  'me.zone.graceEndsAt',
  'game.spawn',
  'game.spawn.reached',
  'game.spawn.total',
  'game.spawn.endsAt',
  'game.revealEndsAt',
  'game.clock',
  'game.clock.endsAt',
  'game.clock.pausedAt',
  'game.teamScore',
  'game.targetScore',
  'game.compromised',
  'game.threshold',
  'game.crewCount',
  'game.meetingsLeft',
  'game.result',
  'game.result.winner',
  'game.result.reason',
  // Phase 5: the viewer's own task cards (a card shows only what its stage has earned).
  'game.tasks',
  'game.tasks[].id',
  'game.tasks[].kind',
  'game.tasks[].stage',
  'game.tasks[].regionId',
  'game.tasks[].regionName',
  'game.tasks[].section',
  'game.tasks[].partnerTag',
  'game.tasks[].lat',
  'game.tasks[].lng',
  'game.tasks[].atPin',
  'game.rerollReadyAt',
]);

/** Key names that must never appear in a lobby view, at any depth (before roles exist). */
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
  /** With `located`: also generate regions, task points and the Base, and take a region-count snapshot. */
  layout?: boolean;
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
  if (opts.located && opts.layout) {
    applyLayout(state, { regeneratePoints: true, keepNames: false });
    refreshRegionCounts(state, FIXTURE_NOW);
  }
  const tokens = new Map(state.players.map((p) => [p.id, sessions.issue(state.code, p.id)]));
  return { state, tokens };
}

export type GamePhaseFixture = 'spawning' | 'reveal' | 'playing' | 'ended';

export interface GameFixtureOptions {
  players?: number;
  phase?: GamePhaseFixture;
  /** Secret room seed: different seeds give different roles. */
  salt?: string;
  /** Mark this player's infection status (a crew member in the structure-parity tests). */
  infection?: { id: string; status: 'exposed' | 'infected' };
}

export interface GameFixture {
  state: RoomState;
  /** The moment the fixture's phase was reached (views are built at this time). */
  now: number;
  tokens: Map<string, string>;
}

/** A game in the given phase, built through the real engine (so roles come from the real assignment). */
export function buildGameFixture(opts: GameFixtureOptions = {}): GameFixture {
  const lobby = newLobby({ players: opts.players ?? 8, radarSalt: opts.salt ?? 'leak-salt' });
  const phase = opts.phase ?? 'playing';
  const reached =
    phase === 'spawning'
      ? toSpawning(lobby)
      : phase === 'reveal'
        ? toReveal(lobby)
        : toPlaying(lobby);
  let { state } = reached;
  const { now } = reached;
  if (phase === 'ended') state = run(state, { type: 'abort', playerId: 'host' }, now).state;
  if (opts.infection) {
    const p = state.players.find((x) => x.id === opts.infection?.id);
    if (p) p.infection = opts.infection.status;
  }
  const sessions = new SessionRegistry();
  const tokens = new Map(state.players.map((p) => [p.id, sessions.issue(state.code, p.id)]));
  return { state, now: Math.max(now, T0), tokens };
}

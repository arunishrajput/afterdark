/**
 * Helpers for engine tests that need a running game. Test-only: production code
 * never imports it. Time is explicit (`now`), and `advanceTo` keeps every fix
 * fresh, because fixes older than `staleAfterS` stop counting.
 */
import { DEFAULT_CONFIG, type GameConfig, type LatLng } from '@afterdark/shared';

import { reduce, type ReduceResult } from './reduce';
import { createRoomState, type RoomState } from './state';
import { tick } from './tick';
import type { Command, Effect } from './types';

export const T0 = 1_700_000_000_000;
export const S = 1000;
export const HOME: LatLng = { lat: 28.6139, lng: 77.209 };

export type OkResult = Extract<ReduceResult, { ok: true }>;

export function ok(res: ReduceResult): OkResult {
  if (!res.ok) throw new Error(`expected ok, got ${res.code}: ${res.message}`);
  return res;
}

export const errCode = (res: ReduceResult): string => (res.ok ? 'OK' : res.code);

export function run(state: RoomState, cmd: Command, now = T0): OkResult {
  return ok(reduce(state, cmd, now));
}

export interface LobbyOptions {
  players?: number;
  radiusM?: number;
  radarSalt?: string;
  /** Overrides for fixed config values (state is built directly, so even 🔒 keys can change). */
  config?: Partial<GameConfig>;
}

/** Host `host` and players `p1…`, a circular boundary, test mode on, everyone located at HOME with a good fix. Nobody is ready. */
export function newLobby(opts: LobbyOptions = {}): RoomState {
  let state = createRoomState({
    code: 'ABC234',
    hostId: 'host',
    username: 'Host',
    allowTestMode: true,
    radarSalt: opts.radarSalt ?? 'salt',
  });
  state.config = { ...state.config, testMode: true, ...opts.config };
  for (let i = 1; i < (opts.players ?? 8); i++) {
    state = run(state, { type: 'join', playerId: `p${i}`, username: `Player ${i}` }).state;
  }
  state = run(state, {
    type: 'setBoundary',
    playerId: 'host',
    boundary: { type: 'circle', center: HOME, radiusM: opts.radiusM ?? 250 },
  }).state;
  for (const p of state.players) {
    state = run(state, {
      type: 'locUpdate',
      playerId: p.id,
      fix: { ...HOME, accuracy: 5, ts: T0 },
    }).state;
  }
  return state;
}

/** Everyone readies up; returns the state with the countdown running. */
export function readyAll(state: RoomState, now = T0): RoomState {
  let s = state;
  for (const p of state.players)
    s = run(s, { type: 'setReady', playerId: p.id, ready: true }, now).state;
  return s;
}

/** Re-send each player's latest position as a fresh good fix, so nobody goes stale. */
export function refresh(state: RoomState, now: number): RoomState {
  let s = state;
  for (const p of state.players) {
    if (p.left || !p.loc) continue;
    s = run(
      s,
      {
        type: 'locUpdate',
        playerId: p.id,
        fix: { lat: p.loc.lat, lng: p.loc.lng, accuracy: 5, ts: now },
      },
      now,
    ).state;
  }
  return s;
}

/** Like `advanceTo`, but returns every effect the refreshes and the tick produced. */
export function advanceWithEffects(
  state: RoomState,
  now: number,
): { state: RoomState; effects: Effect[] } {
  let s = state;
  const effects: Effect[] = [];
  for (const p of state.players) {
    if (p.left || !p.loc) continue;
    const res = run(
      s,
      {
        type: 'locUpdate',
        playerId: p.id,
        fix: { lat: p.loc.lat, lng: p.loc.lng, accuracy: 5, ts: now },
      },
      now,
    );
    s = res.state;
    effects.push(...res.effects);
  }
  const t = tick(s, now);
  return { state: t.state, effects: [...effects, ...t.effects] };
}

/** Refresh the fixes, then run one tick at `now`. */
export function advanceTo(state: RoomState, now: number): RoomState {
  return tick(refresh(state, now), now).state;
}

/** Move one player to a place (test-mode teleport: no speed check). */
export function moveTo(state: RoomState, id: string, at: LatLng, now: number): RoomState {
  return run(state, { type: 'teleport', playerId: id, lat: at.lat, lng: at.lng }, now).state;
}

/** Ready everyone and let the countdown expire: the room is in `spawning`. Returns the state and the time. */
export function toSpawning(state = newLobby()): { state: RoomState; now: number } {
  const ready = readyAll(state);
  const now = T0 + state.config.startCountdownS * S;
  const next = advanceTo(ready, now);
  if (next.phase !== 'spawning') throw new Error(`expected spawning, got ${next.phase}`);
  return { state: next, now };
}

/** Everyone walks to their own spawn (teleport), which ends the spawn phase. */
export function walkToSpawns(state: RoomState, now: number): RoomState {
  let s = state;
  for (const p of state.players) {
    if (p.spawn) s = moveTo(s, p.id, p.spawn, now);
  }
  return s;
}

/** To the role reveal. */
export function toReveal(state = newLobby()): { state: RoomState; now: number } {
  const spawning = toSpawning(state);
  const now = spawning.now + S;
  const s = walkToSpawns(spawning.state, now);
  if (s.phase !== 'reveal') throw new Error(`expected reveal, got ${s.phase}`);
  return { state: s, now };
}

/** To play: the reveal runs out and the clock starts. `now` is the moment the clock started. */
export function toPlaying(state = newLobby()): { state: RoomState; now: number } {
  const reveal = toReveal(state);
  const now = reveal.now + reveal.state.config.roleRevealS * S;
  const s = advanceTo(reveal.state, now);
  if (s.phase !== 'playing') throw new Error(`expected playing, got ${s.phase}`);
  return { state: s, now };
}

export { DEFAULT_CONFIG };

/** Crew players of a running game, in join order. */
export function crewOf(state: RoomState) {
  return state.players.filter((p) => p.role === 'crew');
}

/** A crew member's task by slot index (throws when missing). */
export function taskAt(state: RoomState, playerId: string, index = 0) {
  const t = state.players.find((p) => p.id === playerId)?.tasks?.[index];
  if (!t) throw new Error(`no task ${index} for ${playerId}`);
  return t;
}

/** Any other enabled pool point in the same section as the task (a spot that is in the section but not at the pin). */
export function otherPointInSection(
  state: RoomState,
  task: { pointId?: string; regionId: string; section: string },
): LatLng {
  const pt = state.setup.taskPoints.find(
    (p) =>
      !p.disabled &&
      p.id !== task.pointId &&
      p.regionId === task.regionId &&
      p.section === task.section,
  );
  if (!pt) throw new Error('no second point in that section');
  return { lat: pt.lat, lng: pt.lng };
}

/**
 * Teleport a player to `at`, then step the game forward one second at a time for
 * `seconds` (fixes refreshed each step) so holds and timers run for real.
 */
export function stayAt(state: RoomState, id: string, at: LatLng, from: number, seconds: number) {
  let s = moveTo(state, id, at, from);
  let t = from;
  for (let i = 0; i < seconds; i++) {
    t += S;
    s = advanceTo(s, t);
  }
  return { state: s, now: t };
}

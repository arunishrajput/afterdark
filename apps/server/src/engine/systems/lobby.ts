/**
 * Lobby rules (RULES §3). Systems receive a private draft of the state (a deep
 * copy made by `reduce`/`tick`), mutate it and push effects. Pure: the clock is
 * the `now` argument.
 */
import {
  EDITABLE_CONFIG_KEYS,
  type GameConfigEditablePatch,
  startBlockers,
} from '@afterdark/shared';

import type { RoomState } from '../state';
import { type Effect, RuleError } from '../types';
import { requireGoodFix } from './location';
import { findPlayer } from './players';
import { relayoutAfterConfig, setupSummaryOf } from './setup';
import { beginSpawning } from './spawn';

const MS_PER_S = 1000;

const nameKey = (username: string) => username.toLocaleLowerCase('en-US');

function requireLobby(state: RoomState): void {
  if (state.phase !== 'lobby') throw new RuleError('WRONG_PHASE', 'Only possible in the lobby');
}

function requireHost(state: RoomState, playerId: string): void {
  if (state.hostId !== playerId) throw new RuleError('NOT_HOST', 'Only the host can do that');
}

/** Earliest-joined connected human, else a connected bot, else earliest-joined at all (RULES §3.8). */
function pickNewHost(state: RoomState, excludeId: string): string | undefined {
  const candidates = state.players.filter((p) => p.id !== excludeId && !p.left);
  return (
    candidates.find((p) => p.connected && !p.bot) ??
    candidates.find((p) => p.connected) ??
    candidates[0]
  )?.id;
}

function updateEmptySince(state: RoomState, now: number): void {
  if (state.players.some((p) => p.connected)) delete state.emptySince;
  else state.emptySince ??= now;
}

/** Start or cancel the countdown to match the current roster (RULES §3.7). */
export function evaluateCountdown(state: RoomState, now: number, effects: Effect[]): void {
  if (state.phase !== 'lobby') return;
  const startable =
    startBlockers(state.config, {
      playerCount: state.players.length,
      readyCount: state.players.filter((p) => p.ready).length,
      setup: setupSummaryOf(state),
    }).length === 0;

  if (startable && state.countdownEndsAt === undefined) {
    const endsAt = now + state.config.startCountdownS * MS_PER_S;
    state.countdownEndsAt = endsAt;
    effects.push({ kind: 'event', to: 'all', event: { type: 'lobby.countdown', endsAt } });
  } else if (!startable && state.countdownEndsAt !== undefined) {
    delete state.countdownEndsAt;
    effects.push({ kind: 'event', to: 'all', event: { type: 'lobby.countdownCancelled' } });
  }
}

export function join(state: RoomState, playerId: string, username: string, bot?: true): void {
  if (state.phase !== 'lobby') throw new RuleError('GAME_IN_PROGRESS', 'The game has started');
  if (state.players.length >= state.config.maxPlayers) {
    throw new RuleError('LOBBY_FULL', 'This lobby is full');
  }
  if (state.players.some((p) => nameKey(p.username) === nameKey(username))) {
    throw new RuleError('NAME_TAKEN', 'That name is taken in this lobby');
  }
  state.players.push({
    id: playerId,
    username,
    ready: false,
    connected: true,
    ...(bot ? { bot } : {}),
  });
  delete state.emptySince;
}

export function leave(state: RoomState, playerId: string, now: number, effects: Effect[]): void {
  const p = findPlayer(state, playerId);
  if (state.hostId === playerId) {
    const next = pickNewHost(state, playerId);
    if (next) state.hostId = next;
  }
  if (state.phase === 'lobby') {
    state.players = state.players.filter((x) => x.id !== playerId);
  } else {
    p.connected = false;
    p.ready = false;
    p.left = true;
    p.disconnectedAt = now;
  }
  updateEmptySince(state, now);
  effects.push({ kind: 'removed', playerId, reason: 'left' });
}

/** Un-readying is always allowed; readying needs a good, fresh fix (RULES §3.5). */
export function setReady(state: RoomState, playerId: string, ready: boolean, now: number): void {
  requireLobby(state);
  const p = findPlayer(state, playerId);
  if (ready) requireGoodFix(p, state.config, now);
  p.ready = ready;
}

/** Settings are numbers, strings, booleans or a list of types (Minigame variety): compare lists by content. */
const sameValue = (a: unknown, b: unknown): boolean =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((x, i) => x === b[i])
    : a === b;

export function updateConfig(
  state: RoomState,
  playerId: string,
  patch: GameConfigEditablePatch,
  effects: Effect[],
): void {
  requireLobby(state);
  requireHost(state, playerId);
  if (patch.testMode === true && !state.allowTestMode) {
    throw new RuleError('NOT_ALLOWED', 'Test mode is disabled on this server');
  }
  const changes: GameConfigEditablePatch = {};
  for (const key of EDITABLE_CONFIG_KEYS) {
    const value = patch[key];
    if (value !== undefined && !sameValue(value, state.config[key]))
      Object.assign(changes, { [key]: value });
  }
  if (Object.keys(changes).length === 0) return;
  Object.assign(state.config, changes); // the draft is a private deep copy
  relayoutAfterConfig(state, changes);
  for (const p of state.players) p.ready = false;
  effects.push({ kind: 'event', to: 'all', event: { type: 'lobby.configChanged' } });
}

export function kick(
  state: RoomState,
  playerId: string,
  targetId: string,
  now: number,
  effects: Effect[],
): void {
  requireLobby(state);
  requireHost(state, playerId);
  findPlayer(state, targetId);
  if (targetId === playerId) throw new RuleError('NOT_ALLOWED', 'You cannot kick yourself');
  state.players = state.players.filter((p) => p.id !== targetId);
  updateEmptySince(state, now);
  effects.push({ kind: 'removed', playerId: targetId, reason: 'kicked' });
}

export function connect(state: RoomState, playerId: string): void {
  const p = findPlayer(state, playerId);
  if (p.left) throw new RuleError('NOT_FOUND', 'Player left this game');
  p.connected = true;
  delete p.disconnectedAt;
  delete state.emptySince;
}

/** A disconnected player can't confirm they are ready, so the lobby un-readies them (ADR-036). */
export function disconnect(state: RoomState, playerId: string, now: number): void {
  const p = findPlayer(state, playerId);
  p.connected = false;
  p.disconnectedAt = now;
  if (state.phase === 'lobby') p.ready = false;
  updateEmptySince(state, now);
}

/** Tick: countdown expiry (→ spawning) and host hand-over after `hostDisconnectGraceS`, in the lobby and in a game (E31). */
export function tickLobby(state: RoomState, now: number, effects: Effect[]): void {
  if (
    state.phase === 'lobby' &&
    state.countdownEndsAt !== undefined &&
    now >= state.countdownEndsAt
  ) {
    delete state.countdownEndsAt;
    beginSpawning(state, now, effects);
  }
  const host = state.players.find((p) => p.id === state.hostId);
  const graceMs = state.config.hostDisconnectGraceS * MS_PER_S;
  if (
    host &&
    !host.connected &&
    host.disconnectedAt !== undefined &&
    now - host.disconnectedAt >= graceMs
  ) {
    const others = state.players.filter((p) => p.id !== host.id && p.connected);
    const next = others.find((p) => !p.bot) ?? others[0];
    if (next) state.hostId = next.id;
  }
}

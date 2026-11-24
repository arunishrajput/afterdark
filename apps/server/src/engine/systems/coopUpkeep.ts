/**
 * Co-op session upkeep (RULES §6.7, TASKS §5.7, E20): what happens to sessions on the
 * clock and when something interrupts them. Expiry, a participant gone for good, players
 * who stray, and the resets a meeting or a Task Stop cause. The player commands are in
 * `coop.ts`. Pure: game time drives expiry.
 */
import { distanceM } from '@afterdark/shared';

import { gameNow } from '../clock';
import type { CoopSession, PlayerState, RoomState } from '../state';
import type { Effect } from '../types';
import { fixQuality } from './location';
import { refillSlots } from './tasks';
import { isZoneLocked } from './zone';

const MS_PER_S = 1000;

export type CoopResetReason = 'range' | 'gps' | 'zone' | 'connection' | 'meeting' | 'sabotage';

/** The ids of the two people in a started session. */
export const participantsOf = (s: CoopSession): string[] =>
  [s.starterId, s.joinerId].filter((id): id is string => id !== undefined);

export function removeSession(state: RoomState, s: CoopSession): void {
  if (state.game) state.game.coops = state.game.coops.filter((c) => c.id !== s.id);
}

// ── Interruptions ───────────────────────────────────────────────────────────

/** Takes the given players out of a session. The starter staying keeps the wait open; otherwise it is idle again. */
export function dropParticipants(s: CoopSession, leaving: readonly string[]): void {
  const starterStays = s.starterId !== undefined && !leaving.includes(s.starterId);
  delete s.joinerId;
  delete s.pins;
  s.done = [];
  if (starterStays) {
    s.phase = 'waiting';
  } else {
    s.phase = 'idle';
    delete s.starterId;
  }
}

/** Closes a session for good: both copies go with "Co-op task expired" (E20, TASKS §5.7). */
function expireSession(state: RoomState, s: CoopSession, now: number, effects: Effect[]): void {
  const told = new Set<string>();
  const tell = (id: string | undefined) => {
    if (id === undefined || told.has(id)) return;
    told.add(id);
    effects.push({ kind: 'event', to: [id], event: { type: 'task.expired' } });
  };
  const owner = state.players.find((p) => p.id === s.ownerId);
  const assigned = state.players.find((p) => p.id === s.assignedId);
  if (owner?.tasks?.some((t) => t.id === s.ownerTaskId)) {
    owner.tasks = owner.tasks.filter((t) => t.id !== s.ownerTaskId);
    tell(owner.id);
  }
  if (assigned?.partnerTask?.coopId === s.id) {
    delete assigned.partnerTask;
    tell(assigned.id);
  }
  // A stand-in who was playing it learns the same thing.
  for (const id of participantsOf(s)) tell(id);
  removeSession(state, s);
  if (owner && !owner.spectator && !owner.left) refillSlots(state, owner, now);
}

/** A co-op card was rerolled or its point reported unsafe: the session is closed for both sides. */
export function expireCoopById(
  state: RoomState,
  coopId: string,
  now: number,
  effects: Effect[],
): void {
  const s = state.game?.coops.find((c) => c.id === coopId);
  if (s) expireSession(state, s, now, effects);
}

/** Every session on a pool point the host or a player removed from the game. */
export function expireCoopsAtPoint(
  state: RoomState,
  pointId: string,
  now: number,
  effects: Effect[],
): void {
  for (const s of [...(state.game?.coops ?? [])]) {
    if (s.pointId === pointId) expireSession(state, s, now, effects);
  }
}

/**
 * A meeting or a Task Stop (RULES §8, §7.2): every running puzzle is thrown away and
 * the session goes back to waiting for its starter. Anything idle or waiting stays.
 */
export function resetCoops(
  state: RoomState,
  reason: 'meeting' | 'sabotage',
  effects: Effect[],
): void {
  for (const s of state.game?.coops ?? []) {
    if (s.phase !== 'active') continue;
    for (const id of participantsOf(s)) {
      effects.push({ kind: 'event', to: [id], event: { type: 'task.reset', reason } });
    }
    dropParticipants(s, s.joinerId ? [s.joinerId] : []);
  }
}

/** Why a participant cannot stay in a session right now, if they cannot. */
function faultOf(
  state: RoomState,
  s: CoopSession,
  p: PlayerState | undefined,
  now: number,
): CoopResetReason | undefined {
  if (!p || p.left || p.spectator) return 'connection';
  if (!p.connected) return 'connection';
  if (isZoneLocked(p)) return 'zone';
  const quality = p.loc ? fixQuality(p.loc, now, state.config) : 'stale';
  if (quality === 'stale') return 'gps';
  // A weak fix keeps the session: the player did not move (as for a solo minigame).
  const abandonM = state.config.reachRadiusM + state.config.taskAbandonExtraM;
  if (p.loc && quality === 'good' && distanceM(p.loc, s) > abandonM) return 'range';
  return undefined;
}

/** Has an assigned participant gone for good (ejected, left, or disconnected past the forfeit time)? E20. */
function isGone(state: RoomState, p: PlayerState | undefined, now: number): boolean {
  if (!p || p.left || p.spectator) return true;
  return (
    p.disconnectedAt !== undefined &&
    now - p.disconnectedAt >= state.config.forfeitAfterS * MS_PER_S
  );
}

/** Expiry, a participant gone for good, and participants who strayed. Runs from `advance()` while `playing`. */
export function updateCoops(state: RoomState, now: number, effects: Effect[]): void {
  const game = state.game;
  if (state.phase !== 'playing' || !game) return;
  const gameMs = gameNow(game.clock, now);
  for (const s of [...game.coops]) {
    const owner = state.players.find((p) => p.id === s.ownerId);
    const assigned = state.players.find((p) => p.id === s.assignedId);
    if (gameMs >= s.expiresAtGameMs || isGone(state, owner, now) || isGone(state, assigned, now)) {
      expireSession(state, s, now, effects);
      continue;
    }
    if (s.phase === 'idle') continue;
    const strayed = participantsOf(s).flatMap((id) => {
      const reason = faultOf(
        state,
        s,
        state.players.find((p) => p.id === id),
        now,
      );
      return reason ? [{ id, reason }] : [];
    });
    if (strayed.length === 0) continue;
    if (s.phase === 'active') {
      // The puzzle is gone: everyone in it is told why (the first fault names the reason).
      const reason = strayed[0]?.reason ?? 'range';
      for (const id of participantsOf(s)) {
        effects.push({ kind: 'event', to: [id], event: { type: 'task.reset', reason } });
      }
    }
    dropParticipants(
      s,
      strayed.map((x) => x.id),
    );
  }
}

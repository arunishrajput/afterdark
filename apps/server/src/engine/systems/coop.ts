/**
 * Co-op tasks (RULES §6.7, §7.4–7.5, TASKS §5, E17–E21). A session joins the
 * owner's own-slot card and the partner's partner-slot card. One player starts it
 * at the pin and waits; the second joins (the assigned partner, or a camouflaged
 * imposter standing in for them). Then each shows a PIN and types the other's.
 * Completing it credits both sides the same way whoever stood where (ADR-005).
 * Pure: game time drives expiry, the RNG is seeded by the room.
 */
import {
  type CoopJoinAck,
  coopPinAnswerSchema,
  type CoopSlot,
  type CoopSubmitAck,
  distanceM,
  generateCoopPins,
  puzzleFor,
} from '@afterdark/shared';

import { gameNow } from '../clock';
import type { CoopSession, PlayerState, RoomState } from '../state';
import { type Effect, RuleError } from '../types';
import { applyRecovery } from './abilities';
import { isCamouflaged } from './camouflage';
import { heldTasks, makeCoop } from './coopPairing';
import { fixQuality, requireGoodFix } from './location';
import { findPlayer } from './players';
import { refillSlots, taskRng } from './tasks';
import { requireTasksUnlocked } from './taskStop';
import { isZoneLocked } from './zone';

const MS_PER_S = 1000;

export type CoopResetReason = 'range' | 'gps' | 'zone' | 'connection' | 'meeting' | 'sabotage';

// ── Lookups ─────────────────────────────────────────────────────────────────

/** The ids of the two people in a started session. */
const participantsOf = (s: CoopSession): string[] =>
  [s.starterId, s.joinerId].filter((id): id is string => id !== undefined);

export const slotOf = (s: CoopSession, playerId: string): CoopSlot =>
  playerId === s.ownerId ? 'owner' : 'partner';

/** The started session this player is in, if any. */
export function sessionOfPlayer(state: RoomState, playerId: string): CoopSession | undefined {
  return state.game?.coops.find((c) => c.phase !== 'idle' && participantsOf(c).includes(playerId));
}

/** What this player calls the session: their own card's id, or the join id a stand-in was offered. */
export function taskIdFor(s: CoopSession, playerId: string): string {
  if (playerId === s.ownerId) return s.ownerTaskId;
  if (playerId === s.assignedId) return s.partnerTaskId;
  return s.id;
}

// ── Commands ────────────────────────────────────────────────────────────────

function requireRunning(state: RoomState, now: number) {
  if (state.phase !== 'playing' || !state.game) {
    throw new RuleError('WRONG_PHASE', 'Co-op tasks are only played while the game is running');
  }
  if (state.game.meeting) throw new RuleError('MEETING_ACTIVE', 'Not during a meeting');
  requireTasksUnlocked(state, now);
  return state.game;
}

/** Checks a participant is where the session needs them: zone, a good fix, within reach of the pin. */
function requireAtPin(state: RoomState, p: PlayerState, s: CoopSession, now: number): void {
  if (isZoneLocked(p)) throw new RuleError('TASKS_LOCKED', 'Return to the zone to use tasks');
  requireGoodFix(p, state.config, now);
  if (!p.loc || distanceM(p.loc, s) > state.config.reachRadiusM) {
    throw new RuleError('OUT_OF_RANGE', 'Walk closer to the pin');
  }
}

const busy = () => new RuleError('NOT_ALLOWED', 'That co-op task is busy right now');

/** `coop:start`: at the pin, the first of the two opens a waiting session. */
export function startCoop(state: RoomState, playerId: string, taskId: string, now: number): void {
  const game = requireRunning(state, now);
  const p = findPlayer(state, playerId);
  if (p.left || p.spectator) throw new RuleError('NOT_ALLOWED', 'You are not in the game');
  const task = heldTasks(p).find((t) => t.id === taskId && t.kind === 'coop');
  const s = game.coops.find((c) => c.id === task?.coopId);
  if (!task || !s) throw new RuleError('NOT_FOUND', 'That co-op task is not in your list');
  if (task.stage !== 'pin') throw new RuleError('NOT_ALLOWED', 'Find the pin first');
  requireAtPin(state, p, s, now);
  if (s.starterId === playerId) return; // already waiting
  if (s.phase !== 'idle') throw busy();
  if (sessionOfPlayer(state, playerId)) {
    throw new RuleError('NOT_ALLOWED', 'Finish or cancel the co-op task you have open');
  }
  s.phase = 'waiting';
  s.starterId = playerId;
}

/**
 * `coop:join`: the other assigned participant, or a camouflaged imposter standing
 * in for the partner while the owner waits (E18: whoever joins first is the partner).
 */
export function joinCoop(
  state: RoomState,
  playerId: string,
  taskId: string,
  now: number,
): CoopJoinAck {
  const game = requireRunning(state, now);
  const p = findPlayer(state, playerId);
  if (p.left || p.spectator) throw new RuleError('NOT_ALLOWED', 'You are not in the game');
  const own = heldTasks(p).find((t) => t.id === taskId && t.kind === 'coop');
  const standIn = own === undefined;
  const s = game.coops.find((c) => (own ? c.id === own.coopId : c.id === taskId));
  if (!s) throw new RuleError('NOT_FOUND', 'That co-op task is not in your list');
  if (own && own.stage !== 'pin') throw new RuleError('NOT_ALLOWED', 'Find the pin first');
  if (standIn) {
    // Only a camouflaged imposter, only for the partner's place, only beside a waiting owner.
    if (p.role !== 'imposter' || !isCamouflaged(state, p, now) || s.starterId !== s.ownerId) {
      throw busy();
    }
  }
  if (s.phase !== 'waiting' || s.starterId === playerId) throw busy();
  // The assigned player takes the seat the starter left open.
  if (!standIn && playerId !== (s.starterId === s.ownerId ? s.assignedId : s.ownerId)) throw busy();
  if (sessionOfPlayer(state, playerId)) {
    throw new RuleError('NOT_ALLOWED', 'Finish or cancel the co-op task you have open');
  }
  requireAtPin(state, p, s, now);
  s.joinerId = playerId;
  s.pins = generateCoopPins(taskRng(state), state.config);
  s.done = [];
  s.phase = 'active';
  return { puzzle: puzzleFor(s.pins, slotOf(s, playerId)) };
}

/** `coop:submit`: the PIN the player typed, read off their partner's phone. */
export function submitCoop(
  state: RoomState,
  playerId: string,
  taskId: string,
  answer: unknown,
  now: number,
  effects: Effect[],
): CoopSubmitAck {
  const game = requireRunning(state, now);
  const p = findPlayer(state, playerId);
  const s = sessionOfPlayer(state, playerId);
  if (!s || s.phase !== 'active' || !s.pins || taskIdFor(s, playerId) !== taskId) {
    throw new RuleError('NOT_ALLOWED', 'Join the co-op task first');
  }
  if (isZoneLocked(p)) throw new RuleError('TASKS_LOCKED', 'Return to the zone to use tasks');
  const gameMs = gameNow(game.clock, now);
  const lockedUntil = s.lockedUntilGameMs[playerId];
  if (lockedUntil !== undefined && gameMs < lockedUntil) {
    throw new RuleError('COOLDOWN', 'Wait a moment before trying again');
  }
  const parsed = coopPinAnswerSchema(state.config).safeParse(answer);
  if (!parsed.success) throw new RuleError('INVALID_PAYLOAD', 'That is not a valid PIN');
  const expected = s.pins[slotOf(s, playerId) === 'owner' ? 'partner' : 'owner'];
  if (parsed.data.pin !== expected) {
    s.lockedUntilGameMs[playerId] = gameMs + state.config.taskWrongLockoutS * MS_PER_S;
    return { result: 'wrong', points: 0 };
  }
  if (!s.done.includes(playerId)) s.done.push(playerId);
  if (s.done.length < 2) return { result: 'waiting', points: 0 };
  const credited = completeCoop(state, s, now, effects);
  return { result: 'success', points: credited[playerId] ?? 0 };
}

/** `coop:cancel`: the starter walks away from the wait, or the joiner steps out. The other side keeps waiting. */
export function cancelCoop(state: RoomState, playerId: string, taskId: string): void {
  const s = sessionOfPlayer(state, playerId);
  if (!s || taskIdFor(s, playerId) !== taskId) {
    throw new RuleError('NOT_FOUND', 'You are not in a co-op task');
  }
  dropParticipants(s, [playerId]);
}

// ── Completion and crediting ────────────────────────────────────────────────

/** Fraction of the remaining cooldown an imposter recovers (RULES §7.5), counted per crew partner. */
function recoveryFor(state: RoomState, imposterId: string, crewId: string): number {
  const game = state.game;
  if (!game) return 0;
  const key = `${imposterId}|${crewId}`;
  const done = game.coopPairs[key] ?? 0;
  game.coopPairs[key] = done + 1;
  if (done === 0) return state.config.coopRecoveryFirst;
  if (done === 1) return state.config.coopRecoverySecond;
  return 0;
}

/**
 * Both PINs were right. The team always gets the full value; each crew participant
 * gets the personal credit; an imposter gets none but recovers cooldown. If a
 * stand-in finished it, the assigned partner's copy closes as an ordinary expiry.
 * Returns each participant's personal credit (`coopPersonalPoints` for crew, 0 for an imposter).
 */
function completeCoop(
  state: RoomState,
  s: CoopSession,
  now: number,
  effects: Effect[],
): Record<string, number> {
  const game = state.game;
  const credited: Record<string, number> = {};
  if (!game) return credited;
  const gameMs = gameNow(game.clock, now);
  game.teamScore += state.config.points.coop_pin;
  const participants = participantsOf(s)
    .map((id) => state.players.find((p) => p.id === id))
    .filter((p): p is PlayerState => p !== undefined);
  for (const p of participants) {
    const points = p.role === 'crew' ? state.config.coopPersonalPoints : 0;
    p.personalScore = (p.personalScore ?? 0) + points;
    effects.push({ kind: 'event', to: [p.id], event: { type: 'task.completed', points } });
    if (p.role === 'imposter') {
      applyRecovery(state, p, recoveryFor(state, p.id, s.ownerId), now);
    }
    credited[p.id] = points;
  }
  const owner = state.players.find((p) => p.id === s.ownerId);
  const assigned = state.players.find((p) => p.id === s.assignedId);
  if (owner) owner.tasks = (owner.tasks ?? []).filter((t) => t.id !== s.ownerTaskId);
  if (assigned?.partnerTask?.coopId === s.id) {
    delete assigned.partnerTask;
    // A stand-in took the seat: the real partner's card closes like any expiry (ADR-005, RULES §7.4.3).
    if (!s.done.includes(assigned.id)) {
      effects.push({ kind: 'event', to: [assigned.id], event: { type: 'task.expired' } });
    }
  }
  if (s.pointId) game.pointUsedAtGameMs[s.pointId] = gameMs;
  removeSession(state, s);
  if (owner) refillSlots(state, owner, now);
  return credited;
}

function removeSession(state: RoomState, s: CoopSession): void {
  if (state.game) state.game.coops = state.game.coops.filter((c) => c.id !== s.id);
}

/**
 * `dev:forceCoop` (test mode, host, playing): the owner's first solo card becomes a co-op task with
 * `partnerId`, under the usual eligibility rules. Lets a test pair two chosen players.
 */
export function forceCoop(
  state: RoomState,
  hostId: string,
  ownerId: string,
  partnerId: string,
  now: number,
): void {
  if (!state.config.testMode) throw new RuleError('NOT_ALLOWED', 'Test mode is off');
  if (state.hostId !== hostId) throw new RuleError('NOT_HOST', 'Only the host can do that');
  if (state.phase !== 'playing' || !state.game) throw new RuleError('WRONG_PHASE', 'Not playing');
  const owner = findPlayer(state, ownerId);
  const partner = findPlayer(state, partnerId);
  const base = owner.tasks?.find((t) => t.kind === 'solo' && !t.fake);
  if (owner.role !== 'crew' || !base)
    throw new RuleError('NOT_ALLOWED', 'The owner needs a solo task');
  const card = makeCoop(state, owner, base, now, partner);
  if (!card) throw new RuleError('NOT_ALLOWED', 'That partner is not eligible');
  owner.tasks = (owner.tasks ?? []).map((t) => (t.id === base.id ? card : t));
}

// ── Interruptions ───────────────────────────────────────────────────────────

/** Takes the given players out of a session. The starter staying keeps the wait open; otherwise it is idle again. */
function dropParticipants(s: CoopSession, leaving: readonly string[]): void {
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

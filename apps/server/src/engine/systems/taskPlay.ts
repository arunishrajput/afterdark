/**
 * What a crew member does with a task (TASKS §1, RULES §6): open it at the pin,
 * play the minigame, submit, cancel, reroll or report the point unsafe.
 * Answers are checked here, on the server; the solution never leaves it.
 * Game time (pausable) drives every timer.
 */
import {
  type CrosswordPuzzle,
  distanceM,
  type KeyFeedback,
  type KeyPuzzle,
  type LockFeedback,
  type LockPuzzle,
  minigameOf,
  type PatternPuzzle,
  type SignalPuzzle,
  type SlidePuzzle,
  type SoloMinigameType,
  type TaskActionAck,
  type TaskContext,
  type TaskOpenAck,
  type WiresPuzzle,
} from '@afterdark/shared';

import { gameNow } from '../clock';
import type { PlayerState, RoomState, TaskState } from '../state';
import { type Effect, RuleError } from '../types';
import { expireCoopById, expireCoopsAtPoint } from './coop';
import { heldTasks } from './coopPairing';
import { requireGoodFix } from './location';
import { findPlayer } from './players';
import { isTasker, moveToKeyPoint, refillSlots, resetOpen, taskRng } from './tasks';
import { requireTasksUnlocked } from './taskStop';
import { isZoneLocked } from './zone';

const MS_PER_S = 1000;

/** The player and task for a command, after the checks every task command shares. */
function resolve(state: RoomState, playerId: string, taskId: string) {
  if (state.phase !== 'playing' || !state.game) {
    throw new RuleError('WRONG_PHASE', 'Tasks are only played while the game is running');
  }
  if (state.game.meeting) throw new RuleError('MEETING_ACTIVE', 'Not during a meeting');
  const p = findPlayer(state, playerId);
  // Crew hold own slots; anyone active can hold the partner card (TASKS §5.2).
  const task = heldTasks(p).find((t) => t.id === taskId);
  if (!task) {
    if (!isTasker(p)) throw new RuleError('NOT_ALLOWED', 'Only crew hold tasks');
    throw new RuleError('NOT_FOUND', 'That task is not in your list');
  }
  return { p, task, game: state.game };
}

/** The solo minigame of a task. A co-op task is played through `coop:*` instead. */
function soloTypeOf(task: TaskState): SoloMinigameType {
  if (task.type === 'coop_pin') {
    throw new RuleError('NOT_ALLOWED', 'That is a co-op task: start it with your partner');
  }
  return task.type;
}

/** The minigame of a task. A task's type always has a game: only those types are ever rolled. */
function gameOf(task: TaskState) {
  const game = minigameOf(soloTypeOf(task));
  if (!game) throw new RuleError('INTERNAL', 'No such minigame');
  return game;
}

/** What a minigame may know about the task around it: game time and whether the key is held (TASKS §4). */
function contextOf(state: RoomState, task: TaskState, now: number): TaskContext {
  const clock = state.game?.clock;
  return { gameMs: clock ? gameNow(clock, now) : 0, keyHeld: task.keyHeld === true };
}

/** A player outside the zone can't open tasks or submit (RULES §9.3). */
function requireInZone(p: PlayerState): void {
  if (isZoneLocked(p)) throw new RuleError('TASKS_LOCKED', 'Return to the zone to use tasks');
}

function requireOpen(task: TaskState) {
  if (!task.open) throw new RuleError('NOT_ALLOWED', 'Open the task first');
  return task.open;
}

/** `task:open`: at the pin with a good fix. The reply carries the puzzle and the points, never the solution. */
export function openTask(
  state: RoomState,
  playerId: string,
  taskId: string,
  now: number,
  effects: Effect[],
): void {
  const { p, task } = resolve(state, playerId, taskId);
  requireTasksUnlocked(state, now);
  requireInZone(p);
  if (task.stage !== 'pin') throw new RuleError('NOT_ALLOWED', 'Find the pin first');
  requireGoodFix(p, state.config, now);
  if (!p.loc || distanceM(p.loc, task) > state.config.reachRadiusM) {
    throw new RuleError('OUT_OF_RANGE', 'Walk closer to the pin');
  }
  const game = gameOf(task);
  const type = soloTypeOf(task);
  if (!task.open) {
    if (p.tasks?.some((t) => t.open)) {
      throw new RuleError('NOT_ALLOWED', 'Finish or cancel the task you have open');
    }
    const { puzzle, solution } = game.generate(
      taskRng(state),
      1,
      state.config,
      contextOf(state, task, now),
    );
    task.open = { puzzle, solution };
  }
  // The same ack for a real and a fake task: only the submit result differs (TASKS §1).
  const points = state.config.points[type];
  effects.push({
    kind: 'reply',
    playerId,
    reply: { type: 'open', ack: openAck(type, points, task.open.puzzle) },
  });
}

/**
 * Types the ack for the wire. The puzzle was made by this type's own `generate`,
 * so the casts only restate what the server stored.
 */
function openAck(type: SoloMinigameType, points: number, puzzle: unknown): TaskOpenAck {
  switch (type) {
    case 'wires':
      return { type, points, puzzle: puzzle as WiresPuzzle };
    case 'lock':
      return { type, points, puzzle: puzzle as LockPuzzle };
    case 'pattern':
      return { type, points, puzzle: puzzle as PatternPuzzle };
    case 'signal':
      return { type, points, puzzle: puzzle as SignalPuzzle };
    case 'slide':
      return { type, points, puzzle: puzzle as SlidePuzzle };
    case 'crossword':
      return { type, points, puzzle: puzzle as CrosswordPuzzle };
    case 'keyfetch':
      return { type, points, puzzle: puzzle as KeyPuzzle };
  }
}

/** `task:action`: one step of a multi-step game (a lock guess). Returns the game's feedback. */
export function actOnTask(
  state: RoomState,
  playerId: string,
  taskId: string,
  action: unknown,
  now: number,
  effects: Effect[],
): void {
  const { p, task } = resolve(state, playerId, taskId);
  requireTasksUnlocked(state, now);
  requireInZone(p);
  const open = requireOpen(task);
  const game = gameOf(task);
  if (!game.hasActions) throw new RuleError('INVALID_PAYLOAD', 'This game has no actions');
  const step = game.act(
    open.puzzle,
    open.solution,
    open.progress,
    action,
    taskRng(state),
    contextOf(state, task, now),
  );
  if (step === 'invalid') throw new RuleError('INVALID_PAYLOAD', 'That is not a valid move');
  open.progress = step.state;
  if (step.solution !== undefined) open.solution = step.solution;
  const feedback = step.feedback as LockFeedback | KeyFeedback;
  // Key Fetch: a long enough hold at Point 1 sends the card on to Point 2 (the minigame closes).
  if (task.type === 'keyfetch' && 'picked' in feedback && feedback.picked) {
    moveToKeyPoint(state, p, task, now);
  }
  effects.push({
    kind: 'reply',
    playerId,
    reply: { type: 'action', ack: { feedback } satisfies TaskActionAck },
  });
}

/** Marks the task done: points go to the team and the player (genuine tasks only), then the slot refills. */
function finishTask(
  state: RoomState,
  p: PlayerState,
  task: TaskState,
  now: number,
  effects: Effect[],
): { result: 'success' | 'fooled'; points: number } {
  const game = state.game;
  if (!game) throw new RuleError('WRONG_PHASE', 'No game is running');
  const gameMs = gameNow(game.clock, now);
  p.tasks = (p.tasks ?? []).filter((t) => t.id !== task.id);
  if (task.pointId) game.pointUsedAtGameMs[task.pointId] = gameMs;
  let outcome: { result: 'success' | 'fooled'; points: number };
  if (task.fake) {
    // A fake pays nothing, to the team or to the player (SCORING: Fake tasks).
    outcome = { result: 'fooled', points: 0 };
  } else {
    const points = state.config.points[soloTypeOf(task)];
    game.teamScore += points;
    p.personalScore = (p.personalScore ?? 0) + points;
    effects.push({ kind: 'event', to: [p.id], event: { type: 'task.completed', points } });
    outcome = { result: 'success', points };
  }
  refillSlots(state, p, now);
  return outcome;
}

/** `task:submit`: right answers complete the task; wrong ones lock submitting for `taskWrongLockoutS`. */
export function submitTask(
  state: RoomState,
  playerId: string,
  taskId: string,
  answer: unknown,
  now: number,
  effects: Effect[],
): void {
  const { p, task, game } = resolve(state, playerId, taskId);
  requireTasksUnlocked(state, now);
  requireInZone(p);
  const open = requireOpen(task);
  const gameMs = gameNow(game.clock, now);
  if (open.lockedUntilGameMs !== undefined && gameMs < open.lockedUntilGameMs) {
    throw new RuleError('COOLDOWN', 'Wait a moment before trying again');
  }
  const check = gameOf(task).check(
    open.puzzle,
    open.solution,
    answer,
    open.progress,
    contextOf(state, task, now),
  );
  if (check === 'invalid') throw new RuleError('INVALID_PAYLOAD', 'That is not a valid answer');
  if (check === 'wrong') {
    open.lockedUntilGameMs = gameMs + state.config.taskWrongLockoutS * MS_PER_S;
    effects.push({
      kind: 'reply',
      playerId,
      reply: { type: 'submit', ack: { result: 'wrong', points: 0 } },
    });
    return;
  }
  const outcome = finishTask(state, p, task, now, effects);
  effects.push({ kind: 'reply', playerId, reply: { type: 'submit', ack: outcome } });
}

/** `task:cancel`: closes the minigame; the task stays where it was (at the pin, progress reset). */
export function cancelTask(state: RoomState, playerId: string, taskId: string): void {
  const { task } = resolve(state, playerId, taskId);
  delete task.open;
}

/** `task:reroll`: swap one task for a new one, once per `rerollCooldownS` (RULES §6.5). */
export function rerollTask(
  state: RoomState,
  playerId: string,
  taskId: string,
  now: number,
  effects: Effect[],
): void {
  const { p, task, game } = resolve(state, playerId, taskId);
  // The partner card is a teammate's request: only its owner can swap it out (TASKS §5.2).
  if (p.partnerTask?.id === task.id) {
    throw new RuleError('NOT_ALLOWED', 'You cannot reroll a teammate’s request');
  }
  const gameMs = gameNow(game.clock, now);
  if (p.rerollReadyAtGameMs !== undefined && gameMs < p.rerollReadyAtGameMs) {
    throw new RuleError('COOLDOWN', 'Reroll is not ready yet');
  }
  p.rerollReadyAtGameMs = gameMs + state.config.rerollCooldownS * MS_PER_S;
  p.tasks = (p.tasks ?? []).filter((t) => t.id !== task.id);
  // The rejected point rests, so the new task does not just hand it back.
  if (task.pointId) game.pointUsedAtGameMs[task.pointId] = gameMs;
  // A rerolled co-op card closes the partner's copy too.
  if (task.coopId) expireCoopById(state, task.coopId, now, effects);
  refillSlots(state, p, now);
}

/**
 * `task:reportUnsafe`: the point leaves the pool for the rest of the game and every
 * task on it is replaced, whoever holds it (RULES §6.6). No cooldown; it is logged.
 */
export function reportUnsafe(
  state: RoomState,
  playerId: string,
  taskId: string,
  now: number,
  effects: Effect[],
): void {
  const { p, task } = resolve(state, playerId, taskId);
  const pointId = task.pointId;
  if (pointId === undefined) {
    // A fake has no pool point: just drop it.
    p.tasks = (p.tasks ?? []).filter((t) => t.id !== task.id);
    refillSlots(state, p, now);
    return;
  }
  const point = state.setup.taskPoints.find((tp) => tp.id === pointId);
  if (point) point.disabled = true;
  effects.push({ kind: 'audit', what: 'unsafePoint', pointId });
  // A co-op task on that point closes for both sides before the solo tasks are swapped.
  expireCoopsAtPoint(state, pointId, now, effects);
  for (const owner of state.players) {
    if (!isTasker(owner) || !owner.tasks?.some((t) => t.pointId === pointId)) continue;
    owner.tasks = owner.tasks.filter((t) => t.pointId !== pointId);
    if (owner.id !== playerId) {
      effects.push({
        kind: 'event',
        to: [owner.id],
        event: { type: 'task.removed', reason: 'unsafe' },
      });
    }
    refillSlots(state, owner, now);
  }
}

/** `dev:autoComplete` (test mode): finish the open task as if the right answer was sent. */
export function autoCompleteTask(
  state: RoomState,
  playerId: string,
  taskId: string,
  now: number,
  effects: Effect[],
): void {
  if (!state.config.testMode) throw new RuleError('NOT_ALLOWED', 'Test mode is off');
  const { p, task } = resolve(state, playerId, taskId);
  requireOpen(task);
  finishTask(state, p, task, now, effects);
}

/** A minigame in progress is dropped when its player's connection goes (TASKS §6). */
export function resetOnDisconnect(state: RoomState, playerId: string, effects: Effect[]): void {
  const p = state.players.find((x) => x.id === playerId);
  for (const t of p?.tasks ?? []) if (p) resetOpen(p, t, 'connection', effects);
}

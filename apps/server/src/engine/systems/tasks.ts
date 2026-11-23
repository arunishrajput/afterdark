/**
 * Task slots and the three-stage reveal (RULES §6, TASKS §1–§2, MAP §3–§4):
 * choosing where a new task goes, refilling slots, revealing the pin after the
 * player has held the section, and noticing when they are at the pin. Pure:
 * every roll comes from an RNG seeded from the room's secret seed and a counter.
 */
import {
  createRng,
  distanceM,
  hashSeed,
  ID_ALPHABET,
  offsetByMeters,
  pickMinigameType,
  type Rng,
  sectionBigEnough,
  type SectionId,
  sectionOf,
  type TaskPoint,
} from '@afterdark/shared';

import { gameNow } from '../clock';
import type { PlayerState, RoomState, TaskState } from '../state';
import type { Effect } from '../types';
import { fixQuality } from './location';
import { activePlayers } from './players';

const MS_PER_S = 1000;
const TASK_ID_LENGTH = 16;

/** Weight multipliers for choosing the section of a new task (MAP §4). */
const CURRENT_REGION_WEIGHT = 0.5;
const HELD_SECTION_WEIGHT = 0.25;

/** Directions probed around a fix to see whether its error circle touches the section (hysteresis). */
const EDGE_PROBES = 8;

/** A fresh RNG for one roll. Counting the rolls keeps the game reproducible from the secret seed. */
export function taskRng(state: RoomState): Rng {
  const game = state.game;
  if (!game) throw new Error('taskRng: no game');
  return createRng(hashSeed(`${state.secretSeed}|task|${game.taskSeq++}`));
}

export function newTaskId(rng: Rng): string {
  let id = '';
  for (let i = 0; i < TASK_ID_LENGTH; i++) id += ID_ALPHABET[rng.int(0, ID_ALPHABET.length - 1)];
  return id;
}

/** Crew with a task list: the only players who hold own tasks in Phase 5. */
export const isTasker = (p: PlayerState): boolean => p.role === 'crew' && p.tasks !== undefined;

const pointKey = (regionId: string, section: SectionId) => `${regionId}:${section}`;

function weightedPick<T>(
  rng: Rng,
  items: readonly T[],
  weight: (item: T) => number,
): T | undefined {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  if (total <= 0) return undefined;
  let roll = rng.next() * total;
  for (const item of items) {
    roll -= weight(item);
    if (roll < 0) return item;
  }
  return items.at(-1);
}

/** Pool points that can be handed out: enabled, in a section big enough for tasks. */
function usablePointsBySection(state: RoomState): Map<string, TaskPoint[]> {
  const big = new Set<string>();
  for (const r of state.setup.regions) {
    for (const s of r.sections) {
      if (sectionBigEnough(s.areaM2, state.config)) big.add(pointKey(r.id, s.id));
    }
  }
  const out = new Map<string, TaskPoint[]>();
  for (const p of state.setup.taskPoints) {
    const key = pointKey(p.regionId, p.section);
    if (p.disabled || !big.has(key)) continue;
    out.set(key, [...(out.get(key) ?? []), p]);
  }
  return out;
}

/** Points that other players' tasks sit on right now (a point is not shared when avoidable). */
function pointsHeldByOthers(state: RoomState, me: PlayerState): Set<string> {
  const held = new Set<string>();
  for (const p of activePlayers(state)) {
    if (p.id === me.id) continue;
    for (const t of p.tasks ?? []) if (t.pointId) held.add(t.pointId);
  }
  return held;
}

/**
 * Picks the pin for a new task: from the section, preferring points that are free,
 * rested and far from the player, and relaxing those wishes one at a time (far first).
 */
function choosePoint(
  state: RoomState,
  p: PlayerState,
  rng: Rng,
  candidates: readonly TaskPoint[],
  now: number,
): TaskPoint | undefined {
  const { config } = state;
  const game = state.game;
  if (!game || candidates.length === 0) return undefined;
  const gameMs = gameNow(game.clock, now);
  const othersHold = pointsHeldByOthers(state, p);
  const free = (pt: TaskPoint) => !othersHold.has(pt.id);
  const rested = (pt: TaskPoint) => {
    const used = game.pointUsedAtGameMs[pt.id];
    return used === undefined || gameMs - used >= config.taskPointReuseCooldownS * MS_PER_S;
  };
  const far = (pt: TaskPoint) => !p.loc || distanceM(p.loc, pt) >= config.taskMinDistanceM;
  const tiers = [[far, rested, free], [rested, free], [free], []];
  for (const wishes of tiers) {
    const fit = candidates.filter((pt) => wishes.every((wish) => wish(pt)));
    if (fit.length > 0) return rng.pick(fit);
  }
  return undefined;
}

/** Gives the player one new solo task, or nothing if no section can host one. */
function assignSolo(state: RoomState, p: PlayerState, now: number): TaskState | undefined {
  const rng = taskRng(state);
  const own = p.tasks ?? [];
  const ownPoints = new Set(own.map((t) => t.pointId));
  const ownSections = new Set(own.map((t) => pointKey(t.regionId, t.section)));
  const here = p.loc
    ? sectionOf(p.loc, state.setup.regions, state.config.sectionCentreRatio)
    : null;
  const bySection = usablePointsBySection(state);
  const options = [...bySection.entries()]
    .map(([key, points]) => ({
      key,
      points: points.filter((pt) => !ownPoints.has(pt.id)),
    }))
    .filter((o) => o.points.length > 0);
  const section = weightedPick(rng, options, (o) => {
    const head = o.points[0];
    if (!head) return 0;
    let w = 1;
    if (here && head.regionId === here.regionId) w *= CURRENT_REGION_WEIGHT;
    if (ownSections.has(o.key)) w *= HELD_SECTION_WEIGHT;
    return w;
  });
  if (!section) return undefined;
  const point = choosePoint(state, p, rng, section.points, now);
  if (!point) return undefined;
  return {
    id: newTaskId(rng),
    kind: 'solo',
    pointId: point.id,
    lat: point.lat,
    lng: point.lng,
    regionId: point.regionId,
    section: point.section,
    type: pickMinigameType(rng, state.config),
    stage: 'assigned',
    atPin: false,
  };
}

/** The next task for a slot, in the order TASKS §2 sets: a queued fake, a co-op task (Phase 10), then solo. */
function nextTask(state: RoomState, p: PlayerState, now: number): TaskState | undefined {
  const fake = state.game?.fakeQueue.shift();
  if (fake) {
    const rng = taskRng(state);
    return {
      id: fake.id,
      kind: 'solo',
      lat: fake.lat,
      lng: fake.lng,
      regionId: fake.regionId,
      section: fake.section,
      type: pickMinigameType(rng, state.config, ['keyfetch']),
      fake: true,
      fakeOwnerId: fake.ownerId,
      stage: 'assigned',
      atPin: false,
    };
  }
  return assignSolo(state, p, now);
}

/** Fills the player's empty slots (RULES §6.1). A slot stays empty while no section can host a task. */
export function refillSlots(state: RoomState, p: PlayerState, now: number): void {
  if (!isTasker(p) || !state.game) return;
  const tasks = p.tasks ?? [];
  while (tasks.length < state.config.taskSlots) {
    const task = nextTask(state, p, now);
    if (!task) break;
    tasks.push(task);
  }
  p.tasks = tasks;
}

/** At the start of play every active crew member gets a task list and fills it. */
export function assignInitialTasks(state: RoomState, now: number): void {
  for (const p of activePlayers(state)) {
    if (p.role !== 'crew') continue;
    p.tasks = [];
    refillSlots(state, p, now);
  }
}

/** Does `place` (the section of a fix) match the task's target? */
const inTarget = (place: ReturnType<typeof sectionOf>, t: TaskState) =>
  place?.regionId === t.regionId && place.section === t.section;

/**
 * The fix's error circle touches the task's section: a fix just outside the edge
 * does not reset a hold (MAP §3 hysteresis). Probed in a ring at the accuracy radius.
 */
export function nearTarget(
  state: RoomState,
  at: { lat: number; lng: number; accuracy: number },
  t: TaskState,
) {
  for (let i = 0; i < EDGE_PROBES; i++) {
    const angle = (2 * Math.PI * i) / EDGE_PROBES;
    const probe = offsetByMeters(at, Math.sin(angle) * at.accuracy, Math.cos(angle) * at.accuracy);
    const place = sectionOf(probe, state.setup.regions, state.config.sectionCentreRatio);
    if (inTarget(place, t)) return true;
  }
  return false;
}

export type ResetReason = 'range' | 'gps' | 'zone' | 'connection' | 'meeting' | 'sabotage';

/** Throws away a minigame in progress (progress resets; reveals and held keys are kept, TASKS §6). */
export function resetOpen(
  p: PlayerState,
  task: TaskState,
  reason: ResetReason,
  effects: Effect[],
): void {
  if (!task.open) return;
  delete task.open;
  effects.push({ kind: 'event', to: [p.id], event: { type: 'task.reset', reason } });
}

/** Resets every open minigame the player has (a disconnect, a meeting, a Task Stop). */
export function resetAllOpen(p: PlayerState, reason: ResetReason, effects: Effect[]): void {
  for (const t of p.tasks ?? []) resetOpen(p, t, reason, effects);
}

/** One player's tasks against their latest fix. */
function updatePlayerTasks(state: RoomState, p: PlayerState, now: number, effects: Effect[]) {
  const game = state.game;
  const tasks = p.tasks;
  if (!game || !tasks || tasks.length === 0) return;
  const loc = p.loc;
  const quality = loc ? fixQuality(loc, now, state.config) : 'stale';

  if (!loc || quality === 'stale') {
    // No signal: nothing can be revealed or opened, and a minigame in progress resets.
    for (const t of tasks) {
      delete t.holdSince;
      t.atPin = false;
      resetOpen(p, t, 'gps', effects);
    }
    return;
  }
  if (quality === 'weak') {
    // E5: weak GPS reveals nothing and opens nothing until accuracy improves.
    // A minigame already open is kept: the player did not move.
    for (const t of tasks) {
      delete t.holdSince;
      t.atPin = false;
    }
    return;
  }
  const gameMs = gameNow(game.clock, now);
  const holdMs = state.config.sectionEntryHoldS * MS_PER_S;
  const abandonM = state.config.reachRadiusM + state.config.taskAbandonExtraM;
  const zoned = p.zone !== undefined;
  const place = tasks.some((t) => t.stage === 'assigned')
    ? sectionOf(loc, state.setup.regions, state.config.sectionCentreRatio)
    : null;

  for (const t of tasks) {
    if (t.stage === 'assigned') {
      if (inTarget(place, t)) t.holdSince ??= gameMs;
      else if (t.holdSince !== undefined && !nearTarget(state, loc, t)) delete t.holdSince;
      if (t.holdSince !== undefined && gameMs - t.holdSince >= holdMs) {
        t.stage = 'pin';
        delete t.holdSince;
        effects.push({ kind: 'event', to: [p.id], event: { type: 'task.revealed' } });
      }
    }
    if (t.stage !== 'pin') continue;
    const dist = distanceM(loc, t);
    const wasAtPin = t.atPin;
    t.atPin = !zoned && dist <= state.config.reachRadiusM;
    if (t.atPin && !wasAtPin)
      effects.push({ kind: 'event', to: [p.id], event: { type: 'task.atPin' } });
    if (t.open && zoned) resetOpen(p, t, 'zone', effects);
    else if (t.open && dist > abandonM) resetOpen(p, t, 'range', effects);
  }
}

/** Refills slots and advances every crew member's task stages. Runs while `playing`, after the zone update. */
export function updateTasks(state: RoomState, now: number, effects: Effect[]): void {
  if (state.phase !== 'playing' || !state.game) return;
  for (const p of activePlayers(state)) {
    if (!isTasker(p)) continue;
    refillSlots(state, p, now);
    updatePlayerTasks(state, p, now, effects);
  }
}

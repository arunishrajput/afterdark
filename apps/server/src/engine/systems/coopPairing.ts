/**
 * Choosing a co-op partner and linking the two cards (TASKS §5.1–5.2). Split from
 * `coop.ts` so task generation can use it without importing the session machine.
 */
import { gameNow } from '../clock';
import type { PlayerState, RoomState, TaskState } from '../state';
import { activePlayers } from './players';
import { newTaskId, taskRng } from './taskRng';

const MS_PER_S = 1000;

/** Everything a player holds: their own slots, then the partner slot. */
export const heldTasks = (p: PlayerState): TaskState[] => [
  ...(p.tasks ?? []),
  ...(p.partnerTask ? [p.partnerTask] : []),
];

/** Has the session been paired already: `ownerId` already has a co-op task with `partnerId`. */
export const pairedAlready = (state: RoomState, ownerId: string, partnerId: string): boolean =>
  state.game?.coops.some((c) => c.ownerId === ownerId && c.assignedId === partnerId) ?? false;

/** Players who can take a partner slot (TASKS §5.1): active, connected, free partner slot, not paired with the owner before. */
export function eligiblePartners(state: RoomState, owner: PlayerState): PlayerState[] {
  return activePlayers(state).filter(
    (q) =>
      q.id !== owner.id &&
      q.role !== undefined &&
      q.connected &&
      q.partnerTask === undefined &&
      !pairedAlready(state, owner.id, q.id),
  );
}

/**
 * Turns a freshly rolled solo `base` into a co-op task for `owner`, if some eligible
 * partner holds nothing at its point. Returns the owner's card, or `undefined` to
 * keep it solo (TASKS §5.1: nobody eligible falls back to solo).
 */
export function makeCoop(
  state: RoomState,
  owner: PlayerState,
  base: TaskState,
  now: number,
  forced?: PlayerState,
): TaskState | undefined {
  const game = state.game;
  if (!game) return undefined;
  const fit = eligiblePartners(state, owner).filter(
    (q) => !heldTasks(q).some((t) => t.pointId !== undefined && t.pointId === base.pointId),
  );
  // A test can name the partner; the same eligibility rules still apply.
  const pool = forced ? fit.filter((q) => q.id === forced.id) : fit;
  if (pool.length === 0) return undefined;
  const rng = taskRng(state);
  const partner = rng.pick(pool);
  const id = newTaskId(rng);
  const coopFields = { kind: 'coop' as const, coopId: id, type: 'coop_pin' as const };
  const ownerTask: TaskState = { ...base, ...coopFields };
  const partnerTask: TaskState = { ...base, ...coopFields, id: newTaskId(rng) };
  partner.partnerTask = partnerTask;
  game.coops.push({
    id,
    ownerId: owner.id,
    assignedId: partner.id,
    ownerTaskId: ownerTask.id,
    partnerTaskId: partnerTask.id,
    ...(base.pointId === undefined ? {} : { pointId: base.pointId }),
    lat: base.lat,
    lng: base.lng,
    expiresAtGameMs: gameNow(game.clock, now) + state.config.coopExpiryS * MS_PER_S,
    phase: 'idle',
    done: [],
    lockedUntilGameMs: {},
  });
  return ownerTask;
}

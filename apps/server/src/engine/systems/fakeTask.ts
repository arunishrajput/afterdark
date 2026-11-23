/**
 * Phantom: Fake Task (RULES §7.3, TASKS §7, E13–E16). The Phantom pins a spot; the
 * fake waits in a queue and the next crew slot that refills takes it. A fake is
 * validated like a real point (inside the boundary, outside no-go zones, far from
 * every other point and fake) and counts toward the Phantom's `fakeTaskMaxActive`
 * until it is completed, rerolled, reported or its holder leaves.
 */
import { distanceM, type LatLng, sectionOf } from '@afterdark/shared';

import type { PlayerState, RoomState } from '../state';
import { type Effect, RuleError } from '../types';
import { newTaskId, taskRng } from './tasks';
import { isOutOfBounds } from './zone';

/** Every fake in the game that is still alive: waiting in the queue or held by a crew slot. */
function liveFakes(state: RoomState): { ownerId: string; lat: number; lng: number }[] {
  const held = state.players.flatMap((p) =>
    (p.tasks ?? [])
      .filter((t) => t.fake && t.fakeOwnerId !== undefined)
      .map((t) => ({ ownerId: t.fakeOwnerId ?? '', lat: t.lat, lng: t.lng })),
  );
  return [...(state.game?.fakeQueue ?? []), ...held];
}

/** How many fakes this Phantom has queued or handed out and not yet finished (E14). */
export const activeFakeCount = (state: RoomState, ownerId: string): number =>
  liveFakes(state).filter((f) => f.ownerId === ownerId).length;

/** Checks `ability:fakeTask`'s pin. Throws without side effects, so a rejection uses no cooldown (E13). */
export function checkFakeTask(state: RoomState, actor: PlayerState, at: LatLng): void {
  if (activeFakeCount(state, actor.id) >= state.config.fakeTaskMaxActive) {
    throw new RuleError('NOT_ALLOWED', 'You have too many fake tasks out already');
  }
  if (!state.boundary) throw new RuleError('OUT_OF_BOUNDS', 'There is no play area');
  if (isOutOfBounds(state, at)) {
    throw new RuleError('OUT_OF_BOUNDS', 'Pin it inside the play area, away from no-go zones');
  }
  // Far enough from a real pin that standing at the fake is never also standing at a task (ADR-078).
  const { fakeTaskMinPointDistanceM: pointM, fakeTaskMinDistanceM: fakeM } = state.config;
  if (state.setup.taskPoints.some((p) => !p.disabled && distanceM(p, at) < pointM)) {
    throw new RuleError('NOT_ALLOWED', 'Too close to a task point');
  }
  if (liveFakes(state).some((f) => distanceM(f, at) < fakeM)) {
    throw new RuleError('NOT_ALLOWED', 'Too close to another fake task');
  }
  if (!sectionOf(at, state.setup.regions, state.config.sectionCentreRatio)) {
    throw new RuleError('OUT_OF_BOUNDS', 'Pin it inside the play area');
  }
}

export function activateFakeTask(
  state: RoomState,
  actor: PlayerState,
  at: LatLng,
  effects: Effect[],
): void {
  const place = sectionOf(at, state.setup.regions, state.config.sectionCentreRatio);
  const game = state.game;
  if (!game || !place) throw new RuleError('WRONG_PHASE', 'No game is running');
  // The same id format as any task, so the card is indistinguishable.
  const id = newTaskId(taskRng(state));
  game.fakeQueue.push({
    id,
    ownerId: actor.id,
    lat: at.lat,
    lng: at.lng,
    regionId: place.regionId,
    section: place.section,
  });
  effects.push({
    kind: 'reply',
    playerId: actor.id,
    reply: { type: 'fakeTask', ack: { fakeId: id } },
  });
}

/** An ejected Phantom's queued fakes go with them (Phase 8 hook, MEETINGS §5). Fakes already in a crew slot stay. */
export function removeQueuedFakes(state: RoomState, ownerId: string): void {
  if (state.game) state.game.fakeQueue = state.game.fakeQueue.filter((f) => f.ownerId !== ownerId);
}

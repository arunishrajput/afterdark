/**
 * The viewer's own task cards (TASKS §1, PROTOCOL › TaskCard). Every field is
 * copied explicitly. A card shows only what its stage has earned: a direction at
 * `assigned`, the exact point once the pin is revealed. The minigame type, the
 * points and the puzzle are never here (they arrive in the `task:open` ack), and
 * nobody else's tasks ever are. A fake task has exactly this shape.
 */
import type { TaskCard } from '@afterdark/shared';

import { wallTimeOf } from '../engine/clock';
import type { PlayerState, RoomState, TaskState } from '../engine/state';
import { heldTasks } from '../engine/systems/coopPairing';

/** A co-op card names the other participant and says whether they are already waiting for the viewer. */
function coopFields(
  state: RoomState,
  me: PlayerState,
  t: TaskState,
): { partnerTag?: string; waiting?: boolean } {
  const session = state.game?.coops.find((c) => c.id === t.coopId);
  if (t.kind !== 'coop' || !session) return {};
  const otherId = me.id === session.ownerId ? session.assignedId : session.ownerId;
  const tag = state.players.find((p) => p.id === otherId)?.tag;
  const inIt = session.starterId === me.id || session.joinerId === me.id;
  return {
    ...(tag === undefined ? {} : { partnerTag: tag }),
    waiting: session.phase !== 'idle' && !inIt,
  };
}

function projectCard(state: RoomState, me: PlayerState, t: TaskState): TaskCard {
  const { waiting, ...partner } = coopFields(state, me, t);
  const regionName = state.setup.regions.find((r) => r.id === t.regionId)?.name ?? '';
  const head = {
    id: t.id,
    kind: t.kind,
    regionId: t.regionId,
    regionName,
    section: t.section,
    ...partner,
  };
  if (t.stage === 'assigned') return { ...head, stage: 'assigned' };
  return {
    ...head,
    stage: 'pin',
    lat: t.lat,
    lng: t.lng,
    atPin: t.atPin,
    ...(waiting === undefined ? {} : { partnerWaiting: waiting }),
  };
}

export function projectTasks(state: RoomState, me: PlayerState): TaskCard[] {
  return heldTasks(me).map((t) => projectCard(state, me, t));
}

/** When the viewer may reroll again, as server epoch ms; absent when they can now (or the clock is stopped). */
export function projectRerollReadyAt(
  state: RoomState,
  me: PlayerState,
  now: number,
): number | undefined {
  const ready = me.rerollReadyAtGameMs;
  const game = state.game;
  if (ready === undefined || !game) return undefined;
  const at = wallTimeOf(game.clock, ready, now);
  return at !== undefined && at > now ? at : undefined;
}

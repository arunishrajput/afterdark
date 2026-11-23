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

function projectCard(state: RoomState, t: TaskState): TaskCard {
  const regionName = state.setup.regions.find((r) => r.id === t.regionId)?.name ?? '';
  const head = {
    id: t.id,
    kind: t.kind,
    regionId: t.regionId,
    regionName,
    section: t.section,
  };
  if (t.stage === 'assigned') return { ...head, stage: 'assigned' };
  return { ...head, stage: 'pin', lat: t.lat, lng: t.lng, atPin: t.atPin };
}

export function projectTasks(state: RoomState, me: PlayerState): TaskCard[] {
  return (me.tasks ?? []).map((t) => projectCard(state, t));
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

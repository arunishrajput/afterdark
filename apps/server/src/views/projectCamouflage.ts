/**
 * A camouflaged imposter's disguise (RULES §7.4, ROLES.md): the decoy task cards
 * that fill their crew screen, and the offer to stand in for a waiting co-op partner.
 * Imposter-only: nobody else's view has any of this. Decoys come from a seeded RNG
 * keyed by the player and the disguise's end, so they stay the same across every view
 * rebuild (a view that changed on each tick would be noise), and they are never real
 * task ids and never a real pin.
 */
import {
  type CamouflageView,
  createRng,
  distanceM,
  hashSeed,
  sampleUniform,
  type SectionId,
  sectionOf,
  type TaskCard,
} from '@afterdark/shared';

import type { PlayerState, RoomState } from '../engine/state';
import { camouflageEndsGameMs } from '../engine/systems/camouflage';
import { sessionOfPlayer } from '../engine/systems/coop';
import { fixQuality } from '../engine/systems/location';
import { newTaskId } from '../engine/systems/taskRng';
import { isZoneLocked } from '../engine/systems/zone';

const PIN_DECOY_CHANCE = 0.5;
/** A decoy pin is sampled inside a region; a few tries are plenty for a section lookup that can miss a no-go gap. */
const SAMPLE_TRIES = 8;

/** Every id the game already uses for something real, so a decoy never collides with one. */
function realIds(state: RoomState): Set<string> {
  const ids = new Set<string>();
  for (const p of state.players) {
    for (const t of p.tasks ?? []) ids.add(t.id);
    if (p.partnerTask) ids.add(p.partnerTask.id);
  }
  for (const f of state.game?.fakeQueue ?? []) ids.add(f.id);
  for (const c of state.game?.coops ?? []) ids.add(c.id);
  return ids;
}

/** `taskSlots` plausible cards: a real region and section, a random stage, never a real id or pin. */
export function decoyCards(state: RoomState, me: PlayerState, untilGameMs: number): TaskCard[] {
  const regions = state.setup.regions;
  if (regions.length === 0) return [];
  const rng = createRng(hashSeed(`${state.secretSeed}|decoy|${me.id}|${untilGameMs}`));
  const taken = realIds(state);
  const cards: TaskCard[] = [];
  for (let i = 0; i < state.config.taskSlots; i++) {
    const region = rng.pick(regions);
    let at: { lat: number; lng: number } | undefined;
    let section: SectionId = 'C';
    let regionId = region.id;
    let regionName = region.name;
    for (let t = 0; t < SAMPLE_TRIES && !at; t++) {
      const sample = sampleUniform(region.area, rng, 1)[0];
      const place = sample ? sectionOf(sample, regions, state.config.sectionCentreRatio) : null;
      if (sample && place) {
        at = sample;
        section = place.section;
        regionId = place.regionId;
        regionName = regions.find((r) => r.id === place.regionId)?.name ?? regionName;
      }
    }
    let id = newTaskId(rng);
    while (taken.has(id)) id = newTaskId(rng);
    taken.add(id);
    const head = { id, kind: 'solo' as const, regionId, regionName, section };
    cards.push(
      at && rng.chance(PIN_DECOY_CHANCE)
        ? { ...head, stage: 'pin', lat: at.lat, lng: at.lng, atPin: false }
        : { ...head, stage: 'assigned' },
    );
  }
  return cards;
}

/** A waiting session an imposter beside it could stand in for (the owner waits, the partner has not joined). */
function standInOffer(
  state: RoomState,
  me: PlayerState,
  now: number,
): { taskId: string } | undefined {
  const loc = me.loc;
  if (!loc || isZoneLocked(me) || sessionOfPlayer(state, me.id)) return undefined;
  if (fixQuality(loc, now, state.config) !== 'good') return undefined;
  const s = state.game?.coops.find(
    (c) =>
      c.phase === 'waiting' &&
      c.starterId === c.ownerId &&
      c.assignedId !== me.id &&
      distanceM(loc, c) <= state.config.reachRadiusM,
  );
  return s ? { taskId: s.id } : undefined;
}

/** `me.imposter.camouflage`, or `undefined` while the imposter is not disguised. `until` is a constant server-epoch deadline. */
export function projectCamouflage(
  state: RoomState,
  me: PlayerState,
  now: number,
  deadlineAt: (gameMs: number) => number,
): CamouflageView | undefined {
  const endsGameMs = camouflageEndsGameMs(state, me, now);
  const activeUntil = me.abilities?.camouflage?.activeUntilGameMs;
  if (endsGameMs === undefined || activeUntil === undefined) return undefined;
  const join = standInOffer(state, me, now);
  return {
    until: deadlineAt(endsGameMs),
    decoyTasks: decoyCards(state, me, activeUntil),
    ...(join ? { join } : {}),
  };
}

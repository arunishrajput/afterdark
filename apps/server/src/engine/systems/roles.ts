/**
 * Roles, tags and classes (RULES §5). Everything is drawn from a seeded RNG
 * that is derived from the room's secret seed, so a test can reproduce a game
 * and a player can't derive it from the public lobby code (ADR-050).
 */
import {
  createRng,
  drawTags,
  hashSeed,
  IMPOSTER_CLASSES,
  type ImposterClass,
  infectionThreshold,
  resolveImposterCount,
} from '@afterdark/shared';

import { createClock } from '../clock';
import type { RoomState } from '../state';
import { activePlayers } from './players';

const MS_PER_S = 1000;
const MS_PER_MIN = 60 * MS_PER_S;

/**
 * How many imposters this lobby gets: the configured count, but never so many
 * that fewer than `minCrewRemaining` crew are left (RULES §5.1).
 */
export function imposterCountFor(state: RoomState, playerCount: number): number {
  const wanted = resolveImposterCount(state.config, playerCount);
  return Math.max(0, Math.min(wanted, playerCount - state.config.minCrewRemaining));
}

/** Assigns role, tag and classes to every active player and creates the game state. */
export function assignRoles(state: RoomState, now: number): void {
  const { config } = state;
  const players = activePlayers(state);
  const rng = createRng(hashSeed(`${state.secretSeed}|roles`));

  const imposterIds = new Set(
    rng
      .shuffle(players.map((p) => p.id))
      .slice(0, imposterCountFor(state, players.length)),
  );
  const tags = drawTags(rng, players.length);
  const drawn: ImposterClass[] = rng.shuffle(IMPOSTER_CLASSES);

  let imposterNo = 0;
  players.forEach((p, i) => {
    p.tag = tags[i] ?? `NOTAG-${String(i).padStart(2, '0')}`;
    p.personalScore = 0;
    if (imposterIds.has(p.id)) {
      p.role = 'imposter';
      // `classes`: one class each, no repeats (at most 3 imposters). `all`: every class.
      const own = drawn[imposterNo++ % drawn.length];
      p.classes = config.imposterAbilityMode === 'all' || own === undefined ? [...IMPOSTER_CLASSES] : [own];
    } else {
      p.role = 'crew';
    }
  });

  const crew = players.length - imposterIds.size;
  state.game = {
    clock: createClock(),
    revealEndsAt: now + config.roleRevealS * MS_PER_S,
    rolesAssignedAt: now,
    originalCrewCount: crew,
    threshold: infectionThreshold(config, crew),
    teamScore: 0,
    matchEndsAtGameMs: config.playTimeMin * MS_PER_MIN,
  };
}

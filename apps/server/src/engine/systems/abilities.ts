/**
 * The ability framework (RULES §7, §9.3, PHASE-09). A class ability is a registry
 * entry: its class, its cooldown, an extra check and what it does. `useAbility` runs
 * the checks every ability shares, then the ability's own, and only then starts the
 * cooldown, so a rejected use costs nothing (E13). Cooldowns are game ms: a host
 * pause and a meeting freeze them, and an imposter out of bounds does not recharge
 * (`freezeAbilityCooldowns`). After a meeting every ability waits `postMeetingGraceS`.
 * Infect is not here: every imposter has it, and it lives in `infection.ts`.
 */
import {
  type AbilityId,
  type GameConfig,
  type ImposterClass,
  type LatLng,
} from '@afterdark/shared';

import { gameNow } from '../clock';
import type { AbilityRuntime, PlayerState, RoomState } from '../state';
import { type Effect, RuleError } from '../types';
import { activateCamouflage, isCamouflaged } from './camouflage';
import { activateFakeTask, checkFakeTask } from './fakeTask';
import { requireGoodFix } from './location';
import { logEvent, type LogType } from './log';
import { findPlayer } from './players';
import { activateTaskStop, checkTaskStop } from './taskStop';
import { isOutOfBounds, isZoneLocked } from './zone';

const MS_PER_S = 1000;

/** What an ability is given when used. Only Fake Task takes a payload (the pin). */
export interface AbilityPayload {
  at?: LatLng;
}

export interface AbilityDef {
  id: AbilityId;
  class: ImposterClass;
  /** The cooldown after a successful use, in seconds. */
  cooldownS(config: GameConfig): number;
  /** The ability's own rules; throws a `RuleError` and changes nothing. */
  canActivate(state: RoomState, actor: PlayerState, payload: AbilityPayload, now: number): void;
  activate(
    state: RoomState,
    actor: PlayerState,
    payload: AbilityPayload,
    now: number,
    effects: Effect[],
  ): void;
}

/** The abilities that exist in this build, keyed by id: one per imposter class. */
export const ABILITIES: Partial<Record<AbilityId, AbilityDef>> = {
  taskStop: {
    id: 'taskStop',
    class: 'saboteur',
    cooldownS: (c) => c.taskStopCooldownS,
    canActivate: (state, _actor, _payload, now) => checkTaskStop(state, now),
    activate: (state, actor, _payload, now, effects) =>
      activateTaskStop(state, actor, now, effects),
  },
  fakeTask: {
    id: 'fakeTask',
    class: 'phantom',
    cooldownS: (c) => c.fakeTaskCooldownS,
    canActivate: (state, actor, payload) => {
      if (!payload.at) throw new RuleError('INVALID_PAYLOAD', 'Pick a spot for the fake task');
      checkFakeTask(state, actor, payload.at);
    },
    activate: (state, actor, payload, _now, effects) => {
      if (payload.at) activateFakeTask(state, actor, payload.at, effects);
    },
  },
  camouflage: {
    id: 'camouflage',
    class: 'camouflage',
    cooldownS: (c) => c.camouflageCooldownS,
    canActivate: (state, actor, _payload, now) => {
      if (isCamouflaged(state, actor, now)) {
        throw new RuleError('NOT_ALLOWED', 'You are already disguised');
      }
    },
    activate: (state, actor, _payload, now, effects) =>
      activateCamouflage(state, actor, now, effects),
  },
};

/** The log entry each ability leaves (results timeline). */
const ABILITY_LOG: Record<AbilityId, LogType> = {
  taskStop: 'taskStop',
  fakeTask: 'fakePlanted',
  camouflage: 'camouflage',
};

/** The implemented abilities of a class set, in registry order (`all` mode passes every class). */
export function abilityIdsFor(classes: readonly ImposterClass[]): AbilityId[] {
  return Object.values(ABILITIES)
    .filter((def) => classes.includes(def.class))
    .map((def) => def.id);
}

/** Every ability starts with `abilityInitialCooldownS` of cooldown when play starts (RULES §7). */
export function initialAbilities(
  config: GameConfig,
  classes: readonly ImposterClass[],
): Partial<Record<AbilityId, AbilityRuntime>> {
  const out: Partial<Record<AbilityId, AbilityRuntime>> = {};
  for (const id of abilityIdsFor(classes)) {
    out[id] = { readyAtGameMs: config.abilityInitialCooldownS * MS_PER_S };
  }
  return out;
}

/** The abilities an imposter holds, as `[id, runtime]` pairs. */
export const abilitiesOf = (p: PlayerState): [AbilityId, AbilityRuntime][] =>
  Object.entries(p.abilities ?? {}) as [AbilityId, AbilityRuntime][];

/** `ability:taskStop` / `ability:fakeTask` / `ability:camouflage`: the shared checks, the ability's own, then the cooldown. */
export function useAbility(
  state: RoomState,
  playerId: string,
  id: AbilityId,
  payload: AbilityPayload,
  now: number,
  effects: Effect[],
): void {
  const game = state.game;
  if (state.phase !== 'playing' || !game) throw new RuleError('WRONG_PHASE', 'Not playing');
  const def = ABILITIES[id];
  const actor = findPlayer(state, playerId);
  const own = actor.abilities?.[id];
  if (!def || actor.role !== 'imposter' || actor.left || actor.spectator || !own) {
    throw new RuleError('NOT_ALLOWED', 'You do not have that ability');
  }
  if (game.meeting) throw new RuleError('MEETING_ACTIVE', 'Not during a meeting');
  requireGoodFix(actor, state.config, now);
  if (isZoneLocked(actor) || (actor.loc && isOutOfBounds(state, actor.loc))) {
    throw new RuleError('OUT_OF_BOUNDS', 'Get back inside the area first');
  }
  const gameMs = gameNow(game.clock, now);
  if (gameMs < own.readyAtGameMs) throw new RuleError('COOLDOWN', 'That ability is recharging');
  def.canActivate(state, actor, payload, now);
  def.activate(state, actor, payload, now, effects);
  logEvent(state, now, ABILITY_LOG[id], [playerId], {});
  own.readyAtGameMs = gameMs + def.cooldownS(state.config) * MS_PER_S;
}

/** RULES §9.3: an out-of-bounds imposter's ability cooldowns do not run down. Called with the game time that just passed. */
export function freezeAbilityCooldowns(state: RoomState, gameMs: number, elapsedMs: number): void {
  if (elapsedMs <= 0) return;
  for (const p of state.players) {
    if (!p.zone) continue;
    for (const [, a] of abilitiesOf(p)) {
      if (a.readyAtGameMs > gameMs - elapsedMs) a.readyAtGameMs += elapsedMs;
    }
  }
}

/** After a meeting no ability can be used for `postMeetingGraceS` (RULES §8): the cooldown is raised to the grace deadline. */
export function applyPostMeetingGrace(p: PlayerState, graceUntilGameMs: number): void {
  for (const [, a] of abilitiesOf(p)) {
    a.readyAtGameMs = Math.max(a.readyAtGameMs, graceUntilGameMs);
  }
}

/**
 * Cooldown recovery through apparent cooperation (RULES §7.5): cuts the remaining
 * time of every class ability by `fraction`. Infect is untouched. `coop.ts` calls it
 * when an imposter completes a co-op task.
 */
export function applyRecovery(
  state: RoomState,
  actor: PlayerState,
  fraction: number,
  now: number,
): void {
  const game = state.game;
  if (!game) return;
  const gameMs = gameNow(game.clock, now);
  for (const [, a] of abilitiesOf(actor)) {
    const remaining = a.readyAtGameMs - gameMs;
    if (remaining > 0) a.readyAtGameMs = gameMs + remaining * (1 - fraction);
  }
}

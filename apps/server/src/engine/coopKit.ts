/**
 * Fixtures for co-op and camouflage tests. Test-only: production code never imports it.
 * `ready()` is a running 6-player game; `pair()` hand-builds a co-op task between two
 * chosen players so a test controls who is owner, partner and stand-in.
 */
import { DEFAULT_CONFIG, type GameConfig } from '@afterdark/shared';

import { gameNow } from './clock';
import { reduce } from './reduce';
import type { CoopSession, PlayerState, RoomState } from './state';
import { initialAbilities } from './systems/abilities';
import { advanceTo, crewOf, moveTo, newLobby, run, S, toPlaying } from './testkit';
import type { Command, Effect } from './types';

export const CFG = DEFAULT_CONFIG;
const COOLDOWN_MS = CFG.abilityInitialCooldownS * S;

export const get = (s: RoomState, id: string): PlayerState => {
  const p = s.players.find((x) => x.id === id);
  if (!p) throw new Error(`no player ${id}`);
  return p;
};
export const imposters = (s: RoomState) => s.players.filter((p) => p.role === 'imposter');
export const eventsTo = (effects: Effect[], id: string) =>
  effects.flatMap((e) =>
    e.kind === 'event' && (e.to === 'all' || e.to.includes(id)) ? [e.event] : [],
  );

export interface Fixture {
  state: RoomState;
  now: number;
  /** Two crew members, the first imposter and a third crew member (a bystander). */
  a: string;
  b: string;
  imp: string;
  c: string;
}

/** A 6-player game, solo tasks only, past every initial cooldown, with every imposter holding all three abilities. */
export function ready(extra: Partial<GameConfig> = {}): Fixture {
  const start = toPlaying(
    newLobby({ players: 6, config: { minigamesEnabled: ['wires'], ...extra } }),
  );
  const state = structuredClone(start.state);
  for (const p of imposters(state)) {
    p.classes = ['saboteur', 'phantom', 'camouflage'];
    p.abilities = initialAbilities(state.config, p.classes);
  }
  const now = start.now + COOLDOWN_MS + S;
  const crew = crewOf(state);
  return {
    state: advanceTo(state, now),
    now,
    a: crew[0]!.id,
    b: crew[1]!.id,
    c: crew[2]!.id,
    imp: imposters(state)[0]!.id,
  };
}

/** Hand-builds a co-op task from the owner's first card, partner slot given to `partnerId`, both revealed at the pin. */
export function pair(state: RoomState, ownerId: string, partnerId: string, now: number) {
  const s = structuredClone(state);
  const owner = get(s, ownerId);
  const partner = get(s, partnerId);
  const base = owner.tasks![0]!;
  base.kind = 'coop';
  base.type = 'coop_pin';
  base.stage = 'pin';
  base.coopId = `session-${ownerId}-${partnerId}-${s.game!.coops.length}`;
  const card = { ...base, id: `partner-${base.coopId}`, stage: 'pin' as const };
  partner.partnerTask = card;
  const session: CoopSession = {
    id: base.coopId,
    ownerId,
    assignedId: partnerId,
    ownerTaskId: base.id,
    partnerTaskId: card.id,
    ...(base.pointId === undefined ? {} : { pointId: base.pointId }),
    lat: base.lat,
    lng: base.lng,
    expiresAtGameMs: 0,
    phase: 'idle',
    done: [],
    lockedUntilGameMs: {},
  };
  const game = s.game!;
  session.expiresAtGameMs = gameNow(game.clock, now) + CFG.coopExpiryS * S;
  game.coops.push(session);
  return { state: s, session, ownerCard: base, partnerCard: card };
}

export const pin = (s: RoomState, ownerId: string) => {
  const t = get(s, ownerId).tasks!.find((x) => x.kind === 'coop')!;
  return { lat: t.lat, lng: t.lng };
};

/** Moves players to the pin (teleport) and refreshes the tick. */
export function gather(
  state: RoomState,
  ids: string[],
  at: { lat: number; lng: number },
  now: number,
) {
  let s = state;
  for (const id of ids) s = moveTo(s, id, at, now);
  return advanceTo(s, now + S);
}

export const start = (id: string, taskId: string): Command => ({
  type: 'coopStart',
  playerId: id,
  taskId,
});
export const join = (id: string, taskId: string): Command => ({
  type: 'coopJoin',
  playerId: id,
  taskId,
});
export const submit = (id: string, taskId: string, pinText: string): Command => ({
  type: 'coopSubmit',
  playerId: id,
  taskId,
  answer: { pin: pinText },
});

export function replyOf(effects: Effect[]) {
  const e = effects.find((x) => x.kind === 'reply');
  return e && e.kind === 'reply' ? e.reply : undefined;
}

/** A session at its pin with the owner waiting. */
export function waiting(f: Fixture, partnerId: string) {
  const p = pair(f.state, f.a, partnerId, f.now);
  const at = pin(p.state, f.a);
  let state = gather(p.state, [f.a, partnerId], at, f.now);
  state = run(state, start(f.a, p.ownerCard.id), f.now + 2 * S).state;
  return { ...p, state, at, now: f.now + 2 * S };
}

/** Both inside: active with PINs. */
export function active(f: Fixture, partnerId: string) {
  const w = waiting(f, partnerId);
  const res = run(w.state, join(partnerId, w.partnerCard.id), w.now);
  return { ...w, state: res.state, joinAck: replyOf(res.effects) };
}

export const sessionOf = (s: RoomState, id: string) => s.game!.coops.find((c) => c.id === id)!;

/** `reduce` without throwing, for error-code checks. */
export const run0 = (state: RoomState, cmd: Command, now: number) => reduce(state, cmd, now);

/** Lets `seconds` of game time pass in 5 s steps with every fix refreshed (one big jump would let fixes go stale mid-refresh). */
export function passTime(state: RoomState, from: number, seconds: number): RoomState {
  const STEP_S = 5;
  let s = state;
  for (let t = STEP_S; t <= seconds; t += STEP_S) s = advanceTo(s, from + t * S);
  return advanceTo(s, from + seconds * S);
}

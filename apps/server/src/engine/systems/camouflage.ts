/**
 * Camouflage (RULES §7.4, ADR-027): for `camouflageDurationS` the imposter's own
 * phone shows the crew interface, and they may stand in as a waiting co-op partner.
 * Nothing about this touches any other player: the only state is the imposter's own
 * `activeUntilGameMs`. If the disguise would end while they are in a started co-op
 * session, it lasts until the session ends, by at most `camouflageCoopExtensionMaxS`.
 * It always ends when a meeting is called. Game time, so a pause freezes it.
 */
import { gameNow, wallTimeOf } from '../clock';
import type { PlayerState, RoomState } from '../state';
import { type Effect, RuleError } from '../types';

const MS_PER_S = 1000;

/** In a co-op session that has been started (waiting or active), as the starter or the second participant. */
function inStartedCoop(state: RoomState, playerId: string): boolean {
  return (
    state.game?.coops.some(
      (c) => c.phase !== 'idle' && (c.starterId === playerId || c.joinerId === playerId),
    ) ?? false
  );
}

/** Game ms when the disguise ends, or `undefined` when it is not active (counting any co-op extension). */
export function camouflageEndsGameMs(
  state: RoomState,
  p: PlayerState,
  now: number,
): number | undefined {
  const game = state.game;
  const until = p.abilities?.camouflage?.activeUntilGameMs;
  if (!game || until === undefined || p.role !== 'imposter' || p.left || p.spectator) {
    return undefined;
  }
  const gameMs = gameNow(game.clock, now);
  if (gameMs < until) return until;
  const hardEnd = until + state.config.camouflageCoopExtensionMaxS * MS_PER_S;
  if (gameMs < hardEnd && inStartedCoop(state, p.id)) return hardEnd;
  return undefined;
}

export const isCamouflaged = (state: RoomState, p: PlayerState, now: number): boolean =>
  camouflageEndsGameMs(state, p, now) !== undefined;

/** `ability:camouflage`: the disguise starts now. The cooldown is the framework's. */
export function activateCamouflage(
  state: RoomState,
  actor: PlayerState,
  now: number,
  effects: Effect[],
): void {
  const game = state.game;
  const own = actor.abilities?.camouflage;
  if (!game || !own) throw new RuleError('NOT_ALLOWED', 'You do not have that ability');
  const untilGameMs = gameNow(game.clock, now) + state.config.camouflageDurationS * MS_PER_S;
  own.activeUntilGameMs = untilGameMs;
  effects.push({
    kind: 'reply',
    playerId: actor.id,
    reply: {
      type: 'camouflage',
      ack: { endsAt: wallTimeOf(game.clock, untilGameMs, now) ?? now },
    },
  });
}

/** A meeting ends every disguise: the meeting is neutral for everyone (ADR-028, ADR-084). */
export function endAllCamouflage(state: RoomState): void {
  for (const p of state.players) {
    const own = p.abilities?.camouflage;
    if (own) delete own.activeUntilGameMs;
  }
}

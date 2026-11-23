/**
 * Bot movement (TESTING.md §5, ADR-056): a bot walks to its spawn at walking
 * speed, then wanders inside the boundary. The same code drives the in-process
 * bots (`dev:addBots`) and the bot CLI, so both behave alike. Pure: the only
 * randomness is the `Rng` it is given.
 */
import type { GameConfig } from './config/schema';
import { bearingDeg, distanceM, offsetByMeters } from './geo/distance';
import type { LatLng } from './geo/types';
import type { Rng } from './rng';

type BotConfig = Pick<GameConfig, 'botSpeedMps' | 'botJitterM' | 'botStepS' | 'botWanderLegM'>;

const WANDER_ATTEMPTS = 20;

/** One step of `stepM` metres from `from` toward `to` (lands exactly on `to` when it is closer than a step). */
export function stepToward(from: LatLng, to: LatLng, stepM: number): LatLng {
  const d = distanceM(from, to);
  if (d <= stepM) return { lat: to.lat, lng: to.lng };
  const b = (bearingDeg(from, to) * Math.PI) / 180;
  return offsetByMeters(from, stepM * Math.sin(b), stepM * Math.cos(b));
}

/** The point with GPS noise: up to `jitterM` metres off in each direction. */
export function jittered(at: LatLng, rng: Rng, jitterM: number): LatLng {
  return offsetByMeters(at, (rng.next() * 2 - 1) * jitterM, (rng.next() * 2 - 1) * jitterM);
}

export interface BotWalkerOptions {
  start: LatLng;
  rng: Rng;
  config: BotConfig;
  /** Is this point somewhere a bot may stand (inside the boundary, outside no-go zones)? */
  allowed: (p: LatLng) => boolean;
  /** Where to wander back to when no random leg works out. */
  home: LatLng;
  /** Speed multiplier for demos and tests (the server still rejects jumps above `maxSpeedMps`). */
  speedFactor?: number;
}

export class BotWalker {
  /** The bot's true position. The fix it reports adds jitter. */
  pos: LatLng;
  private goal: LatLng | undefined;

  constructor(private readonly o: BotWalkerOptions) {
    this.pos = o.start;
  }

  private wanderTarget(): LatLng {
    for (let i = 0; i < WANDER_ATTEMPTS; i++) {
      const angle = this.o.rng.next() * 2 * Math.PI;
      const leg = this.o.rng.next() * this.o.config.botWanderLegM;
      const p = offsetByMeters(this.pos, leg * Math.sin(angle), leg * Math.cos(angle));
      if (this.o.allowed(p)) return p;
    }
    return this.o.home;
  }

  /** Advance one `botStepS`. `target` is where the bot has been told to go (a spawn, a task spot); without one it wanders. */
  step(target: LatLng | undefined): LatLng {
    if (target) this.goal = target;
    else if (!this.goal || distanceM(this.pos, this.goal) < 1) this.goal = this.wanderTarget();
    const stepM = this.o.config.botSpeedMps * this.o.config.botStepS * (this.o.speedFactor ?? 1);
    this.pos = stepToward(this.pos, this.goal, stepM);
    return this.pos;
  }

  /** Stand still for one step (a bot working on a task at its pin). */
  stay(): LatLng {
    return this.pos;
  }

  /** The fix to report right now: the true position plus GPS noise. */
  fix(): LatLng {
    return jittered(this.pos, this.o.rng, this.o.config.botJitterM);
  }
}

// ── Imposter bots (Phase 7) ──────────────────────────────────────────────────

/**
 * How an imposter bot plays (`dev:addBots`, `--imposter-behaviour`). `chase` hunts and infects
 * (Phase 7); `sabotage` (Phase 9) does that and also uses its class abilities whenever they are ready.
 */
export const BOT_IMPOSTER_BEHAVIOURS = ['wander', 'chase', 'sabotage'] as const;
export type BotImposterBehaviour = (typeof BOT_IMPOSTER_BEHAVIOURS)[number];

/** Whether bots call meetings (`random`, once each at a random time) or only join the ones others call (`off`, the default). */
export const BOT_MEETING_MODES = ['off', 'random'] as const;
export type BotMeetingMode = (typeof BOT_MEETING_MODES)[number];

/** Bots stop this much inside the infection radius, so GPS jitter does not flip them out of range. */
const CHASE_MARGIN_M = 3;
/** After an infection the bot walks this far past the radius before it hunts again. */
const RETREAT_EXTRA_M = 12;
const RETREAT_BEARINGS = 8;
const FULL_TURN = Math.PI * 2;

export interface ChaseInput {
  here: LatLng;
  /** Where healthy crew-looking players are (the server's state for in-process bots, radar dots over a socket). */
  targets: readonly LatLng[];
  /** Infect is off cooldown. */
  ready: boolean;
  /** A channel is running. */
  channelling: boolean;
  /** Infections this imposter has completed so far: a rise means "walk away now". */
  completed: number;
}

export type ChaseAction = { type: 'go'; to: LatLng | undefined } | { type: 'infect' };

/**
 * The imposter bots' "chase" brain (TESTING §5): walk to the nearest target, start
 * Infect when close, keep following during the channel, then walk away so the
 * incubation can start. Pure apart from the `Rng`; the same code runs in-process and in the CLI.
 */
export class ChaseBrain {
  private seen = 0;
  private retreat: { from: LatLng; to: LatLng } | undefined;

  constructor(
    private readonly o: {
      infectionRadiusM: number;
      rng: Rng;
      allowed: (p: LatLng) => boolean;
    },
  ) {}

  decide(i: ChaseInput): ChaseAction {
    if (i.completed > this.seen) {
      this.seen = i.completed;
      this.retreat = this.retreatFrom(i.here);
    }
    const away = this.o.infectionRadiusM + RETREAT_EXTRA_M;
    if (this.retreat) {
      if (distanceM(this.retreat.from, i.here) < away - 1)
        return { type: 'go', to: this.retreat.to };
      this.retreat = undefined;
    }
    let nearest: { at: LatLng; d: number } | undefined;
    for (const t of i.targets) {
      const d = distanceM(i.here, t);
      if (!nearest || d < nearest.d) nearest = { at: t, d };
    }
    if (!nearest) return { type: 'go', to: undefined };
    if (!i.channelling && i.ready && nearest.d <= this.o.infectionRadiusM - CHASE_MARGIN_M) {
      return { type: 'infect' };
    }
    return { type: 'go', to: nearest.at };
  }

  /** A spot `infectionRadiusM + 12 m` away in a random allowed direction (any direction if none is allowed). */
  private retreatFrom(from: LatLng): { from: LatLng; to: LatLng } {
    const away = this.o.infectionRadiusM + RETREAT_EXTRA_M;
    const start = this.o.rng.next() * FULL_TURN;
    let fallback: LatLng | undefined;
    for (let k = 0; k < RETREAT_BEARINGS; k++) {
      const b = start + (k * FULL_TURN) / RETREAT_BEARINGS;
      const to = offsetByMeters(from, away * Math.sin(b) * 1.2, away * Math.cos(b) * 1.2);
      fallback ??= to;
      if (this.o.allowed(to)) return { from, to };
    }
    return { from, to: fallback ?? from };
  }
}

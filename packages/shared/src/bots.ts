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

  /** Advance one `botStepS`. `spawn` is where the bot has been told to go (while it has not reached it); otherwise it wanders. */
  step(spawn: LatLng | undefined): LatLng {
    if (spawn) this.goal = spawn;
    else if (!this.goal || distanceM(this.pos, this.goal) < 1) this.goal = this.wanderTarget();
    const stepM = this.o.config.botSpeedMps * this.o.config.botStepS * (this.o.speedFactor ?? 1);
    this.pos = stepToward(this.pos, this.goal, stepM);
    return this.pos;
  }

  /** The fix to report right now: the true position plus GPS noise. */
  fix(): LatLng {
    return jittered(this.pos, this.o.rng, this.o.config.botJitterM);
  }
}

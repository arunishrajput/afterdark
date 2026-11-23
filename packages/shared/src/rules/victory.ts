/**
 * Win math (SCORING.md › Win math, RULES §12). Pure and shared, so the engine
 * decides and the client can draw the same numbers.
 */
import type { GameConfig } from '../config/schema';
import type { Winner } from '../types/domain';

const PERCENT = 100;

/** `ceil(infectionWinPercent / 100 × crewCount)`, in integer arithmetic (no float rounding). */
export function infectionThreshold(
  config: Pick<GameConfig, 'infectionWinPercent'>,
  originalCrewCount: number,
): number {
  return Math.ceil((config.infectionWinPercent * originalCrewCount) / PERCENT);
}

/** `a / b` of `value` capped at 1, kept as an exact fraction so comparisons never round. */
interface Fraction {
  num: number;
  den: number;
}

const capped = (value: number, den: number): Fraction => ({ num: Math.min(value, den), den });

export interface Progress {
  teamScore: number;
  targetScore: number;
  compromised: number;
  threshold: number;
}

/**
 * V4, time-up: crew progress `min(1, teamScore / targetScore)` against imposter
 * progress `min(1, compromised / threshold)`. Higher wins; equal is a draw.
 * Cross-multiplies integers, so 1/3 vs 2/6 is exactly equal.
 */
export function winnerOnTimeUp(p: Progress): Exclude<Winner, null> {
  const crew = capped(p.teamScore, p.targetScore);
  const imp = capped(p.compromised, p.threshold);
  const left = crew.num * imp.den;
  const right = imp.num * crew.den;
  if (left === right) return 'draw';
  return left > right ? 'crew' : 'imposters';
}

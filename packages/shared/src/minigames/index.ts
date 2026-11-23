/**
 * The minigame registry (TASKS §3). A type is playable once it is in
 * `MINIGAMES` **and** in the config's `minigamesEnabled`.
 */
import type { GameConfig } from '../config/schema';
import type { Rng } from '../rng';
import { lock } from './lock';
import {
  type ErasedMinigame,
  eraseMinigame,
  type MinigameType,
  type SoloMinigameType,
} from './types';
import { wires } from './wires';

export type { CoopPinAnswer, CoopPinParams, CoopPins, CoopPuzzle, CoopSlot } from './coopPin';
export { coopPinAnswerSchema, generateCoopPins, puzzleFor, verifyCoopPin } from './coopPin';
export type { LockAction, LockCode, LockFeedback, LockPuzzle, LockState } from './lock';
export { lock, rollCode, scoreGuess } from './lock';
export type {
  CheckResult,
  Difficulty,
  ErasedMinigame,
  MinigameDef,
  MinigameParams,
  MinigameType,
  SoloMinigameType,
  TaskContext,
} from './types';
export { eraseMinigame, MINIGAME_TYPES, SOLO_MINIGAME_TYPES } from './types';
export type { WireColor, WireEnd, WiresAnswer, WiresPuzzle, WireSymbol } from './wires';
export { WIRE_COLORS, WIRE_SYMBOLS, wires } from './wires';

/** Games that exist so far (Phase 11 adds the rest). */
export const MINIGAMES: Partial<Record<SoloMinigameType, ErasedMinigame>> = {
  wires: eraseMinigame(wires),
  lock: eraseMinigame(lock),
};

export function minigameOf(type: MinigameType): ErasedMinigame | undefined {
  return (MINIGAMES as Partial<Record<MinigameType, ErasedMinigame>>)[type];
}

/**
 * Weighted pick among the enabled types that have a game and a positive weight.
 * `exclude` leaves a type out (fake tasks never roll `keyfetch`, TASKS §7).
 */
export function pickMinigameType(
  rng: Rng,
  config: Pick<GameConfig, 'minigamesEnabled' | 'minigameWeights'>,
  exclude: readonly SoloMinigameType[] = [],
): SoloMinigameType {
  const pool = config.minigamesEnabled.filter(
    (t) => MINIGAMES[t] !== undefined && !exclude.includes(t) && config.minigameWeights[t] > 0,
  );
  if (pool.length === 0) throw new RangeError('No enabled minigame can be rolled');
  const total = pool.reduce((sum, t) => sum + config.minigameWeights[t], 0);
  let roll = rng.next() * total;
  for (const t of pool) {
    roll -= config.minigameWeights[t];
    if (roll < 0) return t;
  }
  return pool[pool.length - 1] as SoloMinigameType;
}

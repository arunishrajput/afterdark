/**
 * The minigame registry (TASKS §3). A type is rolled when it is in
 * the config's `minigamesEnabled` (the host's Minigame variety).
 */
import type { GameConfig } from '../config/schema';
import type { Rng } from '../rng';
import { crossword } from './crossword';
import { keyfetch } from './keyfetch';
import { lock } from './lock';
import { pattern } from './pattern';
import { signal } from './signal';
import { slide } from './slide';
import {
  type ErasedMinigame,
  eraseMinigame,
  type MinigameType,
  type SoloMinigameType,
} from './types';
import { wires } from './wires';

export type { CoopPinAnswer, CoopPinParams, CoopPins, CoopPuzzle, CoopSlot } from './coopPin';
export { coopPinAnswerSchema, generateCoopPins, puzzleFor, verifyCoopPin } from './coopPin';
export type { CrosswordEntry, CrosswordPuzzle, CrosswordSolution } from './crossword';
export { crossword } from './crossword';
export type { KeyAction, KeyFeedback, KeyPuzzle, KeyState, KeyTurn, KeyTurns } from './keyfetch';
export { keyfetch } from './keyfetch';
export type { LockAction, LockCode, LockFeedback, LockPuzzle, LockState } from './lock';
export { lock, rollCode, scoreGuess } from './lock';
export type { PatternPuzzle } from './pattern';
export { pattern } from './pattern';
export type { SignalPuzzle } from './signal';
export { signal, SIGNAL_GLYPH_COUNT } from './signal';
export type { SlidePuzzle, SlideSolution } from './slide';
export { applyMoves as applySlideMoves, isSolved as isSlideSolved, slide } from './slide';
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

/** Every solo game. */
export const MINIGAMES: Record<SoloMinigameType, ErasedMinigame> = {
  wires: eraseMinigame(wires),
  lock: eraseMinigame(lock),
  pattern: eraseMinigame(pattern),
  signal: eraseMinigame(signal),
  slide: eraseMinigame(slide),
  crossword: eraseMinigame(crossword),
  keyfetch: eraseMinigame(keyfetch),
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
    (t) => !exclude.includes(t) && config.minigameWeights[t] > 0,
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

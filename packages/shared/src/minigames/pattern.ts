/**
 * Pattern Memory (TASKS §4): a 3×3 pad flashes a sequence of `patternLength`
 * steps and the player repeats it. The sequence has to reach the client so it
 * can flash it; the server still checks the replay, so a wrong replay fails.
 */
import { z } from 'zod';

import type { Rng } from '../rng';
import type { MinigameDef, MinigameParams } from './types';

const PAD = 9;
/** Most steps a replay can have: a sanity bound for the answer schema. */
const MAX_STEPS = 12;

export interface PatternPuzzle {
  /** Cells on the pad, numbered 0–8 from the top left, row by row. */
  pad: number;
  /** The cells that flash, in order. */
  sequence: number[];
}

export function generatePattern(rng: Rng, params: Pick<MinigameParams, 'patternLength'>) {
  const sequence: number[] = [];
  for (let i = 0; i < params.patternLength; i++) {
    // The same cell twice in a row would flash as one long blink.
    let cell = rng.int(0, PAD - 1);
    while (cell === sequence[i - 1]) cell = rng.int(0, PAD - 1);
    sequence.push(cell);
  }
  return { puzzle: { pad: PAD, sequence: [...sequence] }, solution: sequence };
}

export const pattern: MinigameDef<PatternPuzzle, number[], number[]> = {
  type: 'pattern',
  generate: (rng, _difficulty, params) => generatePattern(rng, params),
  verify: (_puzzle, solution, answer) =>
    answer.length === solution.length && answer.every((cell, i) => cell === solution[i]),
  answerSchema: z
    .array(
      z
        .number()
        .int()
        .min(0)
        .max(PAD - 1),
    )
    .max(MAX_STEPS),
};

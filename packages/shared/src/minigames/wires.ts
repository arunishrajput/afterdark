/**
 * Wire Connect (TASKS §4): matching wire ends are drawn on the left and the
 * right, in different orders. Every wire has a colour **and** a symbol, so the
 * game never relies on colour alone. The answer is the connection list.
 */
import { z } from 'zod';

import type { Rng } from '../rng';
import type { MinigameDef, MinigameParams } from './types';

export const WIRE_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'] as const;
export const WIRE_SYMBOLS = ['circle', 'square', 'triangle', 'star', 'diamond', 'cross'] as const;
export type WireColor = (typeof WIRE_COLORS)[number];
export type WireSymbol = (typeof WIRE_SYMBOLS)[number];

/** One end of a wire. Both ends of a wire look the same. */
export interface WireEnd {
  color: WireColor;
  symbol: WireSymbol;
}

export interface WiresPuzzle {
  left: WireEnd[];
  right: WireEnd[];
}

/** `answer[i]` is the index on the right that left end `i` is connected to. */
export type WiresAnswer = number[];

const MAX_WIRES = WIRE_COLORS.length;

function sameOrder(a: readonly WireEnd[], b: readonly WireEnd[]): boolean {
  return a.every((end, i) => end === b[i]);
}

export function generateWires(
  rng: Rng,
  params: Pick<MinigameParams, 'wiresPairs'>,
): { puzzle: WiresPuzzle; solution: WiresAnswer } {
  const n = Math.min(params.wiresPairs, MAX_WIRES);
  const colors = rng.shuffle(WIRE_COLORS).slice(0, n);
  const symbols = rng.shuffle(WIRE_SYMBOLS).slice(0, n);
  const wires: WireEnd[] = colors.map((color, i) => ({ color, symbol: symbols[i] as WireSymbol }));
  const left = rng.shuffle(wires);
  // The right side must not simply repeat the left, or there is nothing to connect.
  let right = rng.shuffle(wires);
  while (sameOrder(left, right)) right = rng.shuffle(wires);
  const solution = left.map((end) => right.findIndex((r) => r.color === end.color));
  return { puzzle: { left, right }, solution };
}

export function verifyWires(solution: WiresAnswer, answer: WiresAnswer): boolean {
  return answer.length === solution.length && answer.every((to, i) => to === solution[i]);
}

export const wires: MinigameDef<WiresPuzzle, WiresAnswer, WiresAnswer> = {
  type: 'wires',
  generate: (rng, _difficulty, params) => generateWires(rng, params),
  verify: (_puzzle, solution, answer) => verifyWires(solution, answer),
  answerSchema: z
    .array(
      z
        .number()
        .int()
        .min(0)
        .max(MAX_WIRES - 1),
    )
    .max(MAX_WIRES),
};

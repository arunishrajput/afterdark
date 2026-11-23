import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import { createRng } from '../rng';
import { CTX } from './testCtx';
import { eraseMinigame } from './types';
import { generateWires, wires } from './wires';

const params = DEFAULT_CONFIG;
const erased = eraseMinigame(wires);

describe('wires', () => {
  it('is deterministic for a seed and different for another', () => {
    const a = generateWires(createRng(7), params);
    const b = generateWires(createRng(7), params);
    const c = generateWires(createRng(8), params);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('gives every wire its own colour and symbol, on both sides', () => {
    for (let seed = 0; seed < 50; seed++) {
      const { puzzle } = generateWires(createRng(seed), params);
      for (const side of [puzzle.left, puzzle.right]) {
        expect(side).toHaveLength(params.wiresPairs);
        expect(new Set(side.map((e) => e.color)).size).toBe(params.wiresPairs);
        expect(new Set(side.map((e) => e.symbol)).size).toBe(params.wiresPairs);
      }
      // The two sides hold the same wires in a different order.
      expect(puzzle.right).not.toEqual(puzzle.left);
      const key = (e: { color: string; symbol: string }) => `${e.color}/${e.symbol}`;
      expect(puzzle.right.map(key).sort()).toEqual(puzzle.left.map(key).sort());
    }
  });

  it('accepts the matching connections (round trip) and rejects any other mapping', () => {
    for (let seed = 0; seed < 50; seed++) {
      const { puzzle, solution } = erased.generate(createRng(seed), 1, params, CTX);
      expect(erased.check(puzzle, solution, solution, undefined, CTX)).toBe('right');
      const answer = solution as number[];
      // Swap two connections.
      const swapped = [...answer];
      [swapped[0], swapped[1]] = [swapped[1] as number, swapped[0] as number];
      expect(erased.check(puzzle, solution, swapped, undefined, CTX)).toBe('wrong');
      expect(erased.check(puzzle, solution, answer.slice(1), undefined, CTX)).toBe('wrong');
    }
  });

  it('the solution connects ends that look the same', () => {
    const { puzzle, solution } = generateWires(createRng(3), params);
    solution.forEach((to, i) => expect(puzzle.right[to]).toEqual(puzzle.left[i]));
  });

  it('flags malformed answers as invalid instead of wrong', () => {
    const { puzzle, solution } = erased.generate(createRng(1), 1, params, CTX);
    for (const bad of ['x', null, [1.5], [-1], [99], {}, [1, 2, 3, 4, 5, 6, 7]]) {
      expect(erased.check(puzzle, solution, bad, undefined, CTX)).toBe('invalid');
    }
  });

  it('has no mid-game actions', () => {
    expect(erased.hasActions).toBe(false);
    expect(erased.act({}, [], undefined, {}, createRng(1), CTX)).toBe('invalid');
  });
});

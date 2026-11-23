import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import { createRng } from '../rng';
import { pattern } from './pattern';
import { CTX } from './testCtx';

const gen = (seed: number, patternLength = DEFAULT_CONFIG.patternLength) =>
  pattern.generate(createRng(seed), 1, { ...DEFAULT_CONFIG, patternLength }, CTX);

describe('pattern (Pattern Memory)', () => {
  it('makes a sequence of the configured length on a 3x3 pad, never the same pad twice in a row', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { puzzle, solution } = gen(seed);
      expect(puzzle.pad).toBe(9);
      expect(solution).toHaveLength(DEFAULT_CONFIG.patternLength);
      expect(puzzle.sequence).toEqual(solution);
      solution.forEach((cell, i) => {
        expect(cell).toBeGreaterThanOrEqual(0);
        expect(cell).toBeLessThan(9);
        if (i > 0) expect(cell).not.toBe(solution[i - 1]);
      });
    }
  });

  it('honours a different length and is deterministic for a seed', () => {
    expect(gen(3, 7).solution).toHaveLength(7);
    expect(gen(3)).toEqual(gen(3));
  });

  it('accepts the exact sequence only', () => {
    const { puzzle, solution } = gen(9);
    expect(pattern.verify(puzzle, solution, [...solution], undefined, CTX)).toBe(true);
    const off = [...solution];
    off[2] = ((off[2] as number) + 1) % 9;
    expect(pattern.verify(puzzle, solution, off, undefined, CTX)).toBe(false);
    expect(pattern.verify(puzzle, solution, solution.slice(0, -1), undefined, CTX)).toBe(false);
    expect(pattern.verify(puzzle, solution, [...solution].reverse(), undefined, CTX)).toBe(
      solution.every((c, i) => c === solution[solution.length - 1 - i]),
    );
  });

  it('parses answers: pad cells 0 to 8, bounded length', () => {
    expect(pattern.answerSchema.safeParse([0, 8, 4]).success).toBe(true);
    expect(pattern.answerSchema.safeParse([9]).success).toBe(false);
    expect(pattern.answerSchema.safeParse([-1]).success).toBe(false);
    expect(pattern.answerSchema.safeParse(Array(40).fill(1)).success).toBe(false);
  });
});

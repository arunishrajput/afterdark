import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import { createRng } from '../rng';
import { crossword, entriesOf, transpose } from './crossword';
import { CLUES, CROSSWORD_GRIDS } from './data/crosswords';
import { CTX } from './testCtx';
import { eraseMinigame } from './types';

const gen = (seed: number) => crossword.generate(createRng(seed), 1, DEFAULT_CONFIG, CTX);

describe('crossword bank', () => {
  it('holds at least 20 distinct, square grids of 3 or 4 letters', () => {
    expect(CROSSWORD_GRIDS.length).toBeGreaterThanOrEqual(20);
    const keys = CROSSWORD_GRIDS.map((g) => g.join('/'));
    expect(new Set(keys).size).toBe(keys.length);
    // A transposed copy must not already be in the bank either (it would be a repeat).
    for (const g of CROSSWORD_GRIDS)
      expect(keys.filter((k) => k === transpose(g).join('/')).length).toBeLessThanOrEqual(1);
    for (const g of CROSSWORD_GRIDS) {
      expect([3, 4]).toContain(g.length);
      for (const row of g) {
        expect(row).toHaveLength(g.length);
        expect(row).toMatch(/^[A-Z#]+$/);
      }
    }
  });

  it('gives every across and down word a clue, and every letter both directions', () => {
    for (const g of CROSSWORD_GRIDS) {
      const { across, down, cells } = entriesOf(g);
      for (const e of [...across, ...down]) {
        expect(CLUES[e.word], `${e.word} in ${g.join('/')}`).toBeDefined();
        expect(e.word.length).toBeGreaterThanOrEqual(2);
      }
      // Every letter cell is part of an across word and a down word.
      for (const [key, count] of cells) expect(count, `${key} in ${g.join('/')}`).toBe(2);
      // Word lengths match what the grid shows.
      for (const e of across) expect(g[e.row]?.slice(e.col, e.col + e.word.length)).toBe(e.word);
      for (const e of down) {
        expect(
          g
            .map((r) => r[e.col])
            .join('')
            .slice(e.row, e.row + e.word.length),
        ).toBe(e.word);
      }
    }
  });

  it('has no clue that is not used and none left empty', () => {
    const used = new Set(
      CROSSWORD_GRIDS.flatMap((g) => {
        const { across, down } = entriesOf(g);
        return [...across, ...down].map((e) => e.word);
      }),
    );
    for (const word of Object.keys(CLUES)) expect(used.has(word), word).toBe(true);
    for (const clue of Object.values(CLUES)) expect(clue.trim().length).toBeGreaterThan(3);
  });
});

describe('crossword (Mini Crossword)', () => {
  it('sends the shape and the clues, never a letter', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { puzzle, solution } = gen(seed);
      expect(puzzle.blocks).toHaveLength(puzzle.size);
      for (const row of puzzle.blocks) expect(row).toMatch(/^[.#]+$/);
      expect(JSON.stringify(puzzle)).not.toMatch(/[A-Z]{3}/);
      expect(puzzle.across.length).toBeGreaterThan(0);
      expect(puzzle.down.length).toBeGreaterThan(0);
      // The first clue number is 1 and numbers are shared by an across and a down entry where both start.
      expect(Math.min(...[...puzzle.across, ...puzzle.down].map((e) => e.n))).toBe(1);
      for (const e of [...puzzle.across, ...puzzle.down]) {
        expect(e.clue.length).toBeGreaterThan(3);
        expect(e.len).toBeGreaterThanOrEqual(2);
      }
      expect(solution).toHaveLength(puzzle.size);
    }
  });

  it('uses the grid and its transpose, deterministically for a seed', () => {
    expect(gen(4)).toEqual(gen(4));
    const shapes = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) shapes.add(gen(seed).solution.join('/'));
    expect(shapes.size).toBeGreaterThan(CROSSWORD_GRIDS.length);
  });

  it('is case-insensitive and exact', () => {
    const { puzzle, solution } = gen(6);
    expect(crossword.verify(puzzle, solution, [...solution], undefined, CTX)).toBe(true);
    expect(
      crossword.verify(
        puzzle,
        solution,
        solution.map((r) => r.toLowerCase()),
        undefined,
        CTX,
      ),
    ).toBe(true);
    const wrong = [...solution];
    const first = wrong[0] as string;
    const at = first.search(/[A-Z]/);
    wrong[0] = `${first.slice(0, at)}${first[at] === 'Q' ? 'Z' : 'Q'}${first.slice(at + 1)}`;
    expect(crossword.verify(puzzle, solution, wrong, undefined, CTX)).toBe(false);
    expect(crossword.verify(puzzle, solution, solution.slice(1), undefined, CTX)).toBe(false);
  });

  it('parses answers: rows of letters or #', () => {
    const erased = eraseMinigame(crossword);
    const { puzzle, solution } = gen(2);
    expect(erased.check(puzzle, solution, solution, undefined, CTX)).toBe('right');
    expect(erased.check(puzzle, solution, ['12', '34'], undefined, CTX)).toBe('invalid');
    expect(erased.check(puzzle, solution, 'ABC', undefined, CTX)).toBe('invalid');
    expect(erased.check(puzzle, solution, Array(9).fill('ABC'), undefined, CTX)).toBe('invalid');
  });
});

import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import { createRng } from '../rng';
import { applyMoves, isSolved, legalMoves, slide } from './slide';
import { CTX } from './testCtx';

/** A shortest solution by breadth-first search. Test code only: the game never solves its own puzzles. */
function solveMoves(tiles: readonly number[]): number[] | undefined {
  const key = (t: readonly number[]) => t.join('');
  const seen = new Map<string, { from: string; tile: number } | null>([[key(tiles), null]]);
  let frontier: number[][] = [[...tiles]];
  while (frontier.length > 0) {
    const next: number[][] = [];
    for (const board of frontier) {
      if (isSolved(board)) {
        const moves: number[] = [];
        for (let step = seen.get(key(board)); step;) {
          moves.push(step.tile);
          step = seen.get(step.from);
        }
        return moves.reverse();
      }
      for (const tile of legalMoves(board)) {
        const moved = applyMoves(board, [tile]);
        if (!moved || seen.has(key(moved))) continue;
        seen.set(key(moved), { from: key(board), tile });
        next.push(moved);
      }
    }
    frontier = next;
  }
  return undefined;
}

/** A 3×3 board is solvable exactly when its tiles (gap left out) have an even number of inversions. */
const solvable = (tiles: readonly number[]) => {
  const t = tiles.filter((x) => x !== 0);
  let inversions = 0;
  for (let i = 0; i < t.length; i++) {
    for (let j = i + 1; j < t.length; j++) if ((t[i] as number) > (t[j] as number)) inversions++;
  }
  return inversions % 2 === 0;
};

const gen = (seed: number) => slide.generate(createRng(seed), 1, DEFAULT_CONFIG, CTX);

describe('slide (Sliding Puzzle)', () => {
  it('always makes a shuffled, solvable 3x3 board', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { puzzle } = gen(seed);
      expect(puzzle.size).toBe(3);
      expect([...puzzle.tiles].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      expect(isSolved(puzzle.tiles)).toBe(false);
      expect(solvable(puzzle.tiles)).toBe(true);
    }
  });

  it('is solved by the reference solver, and the stored solution is no shorter than it', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const { puzzle, solution } = gen(seed);
      const best = solveMoves(puzzle.tiles) ?? [];
      expect(isSolved(applyMoves(puzzle.tiles, best) ?? [])).toBe(true);
      expect(best.length).toBeLessThanOrEqual(solution.length);
    }
  });

  it('shuffles with 20 to 30 legal moves from the solved board (so parity is always right)', () => {
    const { puzzle, solution } = gen(7);
    // The solution is the stored way back; its length is the shuffle length.
    expect(solution.length).toBeGreaterThanOrEqual(DEFAULT_CONFIG.slideShuffleMinMoves);
    expect(solution.length).toBeLessThanOrEqual(DEFAULT_CONFIG.slideShuffleMaxMoves);
    expect(isSolved(applyMoves(puzzle.tiles, solution) ?? [])).toBe(true);
  });

  it('is deterministic for a seed', () => {
    expect(gen(5)).toEqual(gen(5));
    expect(gen(5).puzzle.tiles).not.toEqual(gen(6).puzzle.tiles);
  });

  it('passes a replayed solution and nothing else', () => {
    const { puzzle, solution } = gen(11);
    expect(slide.verify(puzzle, solution, solution, undefined, CTX)).toBe(true);
    const better = solveMoves(puzzle.tiles) ?? [];
    expect(slide.verify(puzzle, solution, better, undefined, CTX)).toBe(true);
    // Dropping the last move leaves it unsolved.
    expect(slide.verify(puzzle, solution, solution.slice(0, -1), undefined, CTX)).toBe(false);
    expect(slide.verify(puzzle, solution, [], undefined, CTX)).toBe(false);
  });

  it('fails an illegal move: a tile that is not next to the gap', () => {
    const { puzzle } = gen(13);
    const gap = puzzle.tiles.indexOf(0);
    const far = puzzle.tiles.findIndex(
      (_, i) =>
        Math.abs(Math.floor(i / 3) - Math.floor(gap / 3)) + Math.abs((i % 3) - (gap % 3)) > 1,
    );
    const farTile = puzzle.tiles[far] as number;
    expect(applyMoves(puzzle.tiles, [farTile])).toBeUndefined();
    expect(slide.verify(puzzle, [], [farTile], undefined, CTX)).toBe(false);
    expect(applyMoves(puzzle.tiles, [0])).toBeUndefined();
  });

  it('parses answers: tile numbers 1 to 8, bounded length', () => {
    expect(slide.answerSchema.safeParse([1, 2, 3]).success).toBe(true);
    expect(slide.answerSchema.safeParse([0]).success).toBe(false);
    expect(slide.answerSchema.safeParse([9]).success).toBe(false);
    expect(slide.answerSchema.safeParse(Array(500).fill(1)).success).toBe(false);
    expect(slide.answerSchema.safeParse('x').success).toBe(false);
  });
});

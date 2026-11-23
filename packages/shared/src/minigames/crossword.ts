/**
 * Mini Crossword (TASKS §4): a 3×3 or 4×4 mini from the curated bank in
 * `data/crosswords.ts`, with across and down clues. A grid is a list of rows
 * (`#` is a block). The puzzle shows the shape and the clues but no letters; the
 * answer is the grid the player filled in, compared case-insensitively. Half the
 * time the grid is transposed, so across and down swap and the bank plays twice.
 */
import { z } from 'zod';

import type { Rng } from '../rng';
import { CLUES, CROSSWORD_GRIDS } from './data/crosswords';
import type { MinigameDef } from './types';

const MAX_SIZE = 4;
const BLOCK = '#';

export interface CrosswordEntry {
  /** The clue number, shared by the across and down entries that start in the same cell. */
  n: number;
  row: number;
  col: number;
  len: number;
  clue: string;
}

export interface CrosswordPuzzle {
  size: number;
  /** One string per row: `.` is a cell to fill, `#` a block. */
  blocks: string[];
  across: CrosswordEntry[];
  down: CrosswordEntry[];
}

/** The filled grid, one string per row (`#` for blocks). */
export type CrosswordSolution = string[];

export const transpose = (grid: readonly string[]): string[] =>
  grid.map((_, c) => grid.map((row) => row[c]).join(''));

interface Run {
  word: string;
  row: number;
  col: number;
}

/** Words of 2+ letters in each direction, plus how many words cover each letter cell. */
export function entriesOf(grid: readonly string[]) {
  const size = grid.length;
  const across: Run[] = [];
  const down: Run[] = [];
  const cells = new Map<string, number>();
  const cover = (r: number, c: number) => cells.set(`${r},${c}`, (cells.get(`${r},${c}`) ?? 0) + 1);
  for (let r = 0; r < size; r++) {
    for (const m of (grid[r] ?? '').matchAll(/[A-Z]{2,}/g)) {
      across.push({ word: m[0], row: r, col: m.index });
      for (let i = 0; i < m[0].length; i++) cover(r, m.index + i);
    }
  }
  const cols = transpose(grid);
  for (let c = 0; c < size; c++) {
    for (const m of (cols[c] ?? '').matchAll(/[A-Z]{2,}/g)) {
      down.push({ word: m[0], row: m.index, col: c });
      for (let i = 0; i < m[0].length; i++) cover(m.index + i, c);
    }
  }
  // Letters that no 2+ letter word covers still count as cells with zero cover.
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r]?.[c] !== BLOCK && !cells.has(`${r},${c}`)) cells.set(`${r},${c}`, 0);
    }
  }
  return { across, down, cells };
}

/** Builds what the client gets: shape and clues. Numbers go left to right, top to bottom. */
function puzzleOf(grid: readonly string[]): CrosswordPuzzle {
  const { across, down } = entriesOf(grid);
  const starts = [...new Set([...across, ...down].map((e) => `${e.row},${e.col}`))].sort((a, b) => {
    const [ar = 0, ac = 0] = a.split(',').map(Number);
    const [br = 0, bc = 0] = b.split(',').map(Number);
    return ar - br || ac - bc;
  });
  const numberAt = (r: Run) => starts.indexOf(`${r.row},${r.col}`) + 1;
  const entry = (r: Run): CrosswordEntry => ({
    n: numberAt(r),
    row: r.row,
    col: r.col,
    len: r.word.length,
    clue: CLUES[r.word] ?? '',
  });
  return {
    size: grid.length,
    blocks: grid.map((row) => row.replace(/[A-Z]/g, '.')),
    across: across.map(entry),
    down: down.map(entry),
  };
}

export function generateCrossword(rng: Rng): {
  puzzle: CrosswordPuzzle;
  solution: CrosswordSolution;
} {
  const base = rng.pick(CROSSWORD_GRIDS);
  const grid = rng.chance(0.5) ? transpose(base) : [...base];
  return { puzzle: puzzleOf(grid), solution: grid };
}

export const crossword: MinigameDef<CrosswordPuzzle, CrosswordSolution, string[]> = {
  type: 'crossword',
  generate: (rng) => generateCrossword(rng),
  verify: (_puzzle, solution, answer) =>
    answer.length === solution.length &&
    answer.every((row, i) => row.toUpperCase() === solution[i]),
  answerSchema: z
    .array(
      z
        .string()
        .regex(/^[A-Za-z#]+$/)
        .max(MAX_SIZE),
    )
    .max(MAX_SIZE),
};

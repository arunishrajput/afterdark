/**
 * Sliding Puzzle (TASKS §4): a 3×3 board of tiles 1–8 and a gap, shuffled by
 * making `slideShuffleMinMoves` to `slideShuffleMaxMoves` random legal moves
 * from the solved board, so it is always solvable. The answer is a move list
 * (the number of the tile slid into the gap each time); the server replays it.
 */
import { z } from 'zod';

import type { Rng } from '../rng';
import type { MinigameDef, MinigameParams } from './types';

const SIZE = 3;
const CELLS = SIZE * SIZE;
/** The gap is 0. */
const SOLVED: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 0];
/** No answer needs more moves than this; it bounds the replay (and the payload). */
const MAX_ANSWER_MOVES = 200;

export interface SlidePuzzle {
  size: number;
  /** Row-major; 0 is the gap. */
  tiles: number[];
}

/** The way back to the solved board, in the form of an answer. */
export type SlideSolution = number[];

export const isSolved = (tiles: readonly number[]): boolean =>
  tiles.length === CELLS && tiles.every((t, i) => t === SOLVED[i]);

const isNextTo = (a: number, b: number) =>
  Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)) + Math.abs((a % SIZE) - (b % SIZE)) === 1;

/** Slides `tile` into the gap. `undefined` when the tile is not next to the gap (or is not on the board). */
function slideTile(tiles: readonly number[], tile: number): number[] | undefined {
  const at = tiles.indexOf(tile);
  const gap = tiles.indexOf(0);
  if (tile === 0 || at < 0 || !isNextTo(at, gap)) return undefined;
  const next = [...tiles];
  next[gap] = tile;
  next[at] = 0;
  return next;
}

/** Replays a move list. `undefined` as soon as a move is illegal. */
export function applyMoves(
  tiles: readonly number[],
  moves: readonly number[],
): number[] | undefined {
  let board: number[] | undefined = [...tiles];
  for (const tile of moves) {
    board = slideTile(board, tile);
    if (!board) return undefined;
  }
  return board;
}

/** Tiles that can slide into the gap right now. */
export function legalMoves(tiles: readonly number[]): number[] {
  const gap = tiles.indexOf(0);
  return tiles.filter((t, i) => t !== 0 && isNextTo(i, gap));
}

/** Shuffles by walking `count` legal moves from the solved board, never undoing the move just made. */
function shuffle(rng: Rng, count: number) {
  let board: number[] = [...SOLVED];
  const made: number[] = [];
  let last = -1;
  for (let i = 0; i < count; i++) {
    const options = legalMoves(board).filter((t) => t !== last);
    const tile = rng.pick(options);
    board = slideTile(board, tile) ?? board;
    made.push(tile);
    last = tile;
  }
  return { board, made };
}

export function generateSlide(
  rng: Rng,
  params: Pick<MinigameParams, 'slideShuffleMinMoves' | 'slideShuffleMaxMoves'>,
): { puzzle: SlidePuzzle; solution: SlideSolution } {
  for (;;) {
    const count = rng.int(params.slideShuffleMinMoves, params.slideShuffleMaxMoves);
    const { board, made } = shuffle(rng, count);
    // A walk can wander back to the start; then it is not a puzzle.
    if (isSolved(board)) continue;
    // Undoing the shuffle in reverse order is a valid solution.
    return { puzzle: { size: SIZE, tiles: board }, solution: [...made].reverse() };
  }
}

export const slide: MinigameDef<SlidePuzzle, SlideSolution, number[]> = {
  type: 'slide',
  generate: (rng, _difficulty, params) => generateSlide(rng, params),
  verify: (puzzle, _solution, answer) => {
    const end = applyMoves(puzzle.tiles, answer);
    return end !== undefined && isSolved(end);
  },
  answerSchema: z
    .array(
      z
        .number()
        .int()
        .min(1)
        .max(CELLS - 1),
    )
    .max(MAX_ANSWER_MOVES),
};

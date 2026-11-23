/**
 * Lock Breaker (TASKS §4): guess a short code. Each guess (`task:action`) comes
 * back as "right digit, right place" and "right digit, wrong place" counts.
 * After `lockMaxGuesses` wrong guesses the lock re-rolls its code and the
 * player starts again. The final `task:submit` only counts after a guess that
 * the server saw match the code, so the guess limit cannot be sidestepped by
 * submitting codes blindly.
 */
import { z } from 'zod';

import type { Rng } from '../rng';
import type { MinigameDef, MinigameParams } from './types';

export interface LockPuzzle {
  digits: number;
  /** Digits run from 0 to this. */
  maxDigit: number;
  maxGuesses: number;
}

export type LockCode = number[];

export interface LockState {
  /** Wrong guesses since the code was last rolled. */
  used: number;
  /** A guess matched the code. */
  solved: boolean;
}

export interface LockFeedback {
  /** Right digit in the right place. */
  exact: number;
  /** Right digit in the wrong place. */
  misplaced: number;
  guessesLeft: number;
  solved: boolean;
  /** The guesses ran out: the code changed, start again. */
  rerolled: boolean;
}

const MAX_DIGITS = 5;
const MAX_DIGIT = 9;

export interface LockAction {
  guess: number[];
}

export function rollCode(rng: Rng, params: Pick<MinigameParams, 'lockDigits' | 'lockDigitMax'>) {
  return Array.from({ length: params.lockDigits }, () => rng.int(0, params.lockDigitMax));
}

/** Mastermind scoring: exact matches, and common digits beyond those. */
export function scoreGuess(code: readonly number[], guess: readonly number[]) {
  let exact = 0;
  const codeCounts = new Map<number, number>();
  const guessCounts = new Map<number, number>();
  code.forEach((digit, i) => {
    if (guess[i] === digit) {
      exact++;
      return;
    }
    codeCounts.set(digit, (codeCounts.get(digit) ?? 0) + 1);
    const g = guess[i];
    if (g !== undefined) guessCounts.set(g, (guessCounts.get(g) ?? 0) + 1);
  });
  let misplaced = 0;
  for (const [digit, n] of guessCounts) misplaced += Math.min(n, codeCounts.get(digit) ?? 0);
  return { exact, misplaced };
}

const sameCode = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((d, i) => d === b[i]);

export const lock: MinigameDef<
  LockPuzzle,
  LockCode,
  number[],
  LockAction,
  LockFeedback,
  LockState
> = {
  type: 'lock',
  generate: (rng, _difficulty, params) => ({
    puzzle: {
      digits: params.lockDigits,
      maxDigit: params.lockDigitMax,
      maxGuesses: params.lockMaxGuesses,
    },
    solution: rollCode(rng, params),
  }),
  verify: (_puzzle, solution, answer, state) =>
    state?.solved === true && sameCode(solution, answer),
  act: (puzzle, solution, state, { guess }, rng) => {
    const valid =
      guess.length === puzzle.digits && guess.every((d) => d >= 0 && d <= puzzle.maxDigit);
    const done: LockFeedback = {
      exact: puzzle.digits,
      misplaced: 0,
      guessesLeft: puzzle.maxGuesses - (state?.used ?? 0),
      solved: true,
      rerolled: false,
    };
    if (state?.solved) return { state, feedback: done };
    if (!valid) {
      // A malformed guess costs nothing: the client UI never sends one.
      return {
        state: state ?? { used: 0, solved: false },
        feedback: { ...done, exact: 0, solved: false },
      };
    }
    const { exact, misplaced } = scoreGuess(solution, guess);
    if (exact === puzzle.digits) {
      return { state: { used: state?.used ?? 0, solved: true }, feedback: done };
    }
    const used = (state?.used ?? 0) + 1;
    if (used >= puzzle.maxGuesses) {
      return {
        state: { used: 0, solved: false },
        solution: rollCode(rng, {
          lockDigits: puzzle.digits,
          lockDigitMax: puzzle.maxDigit,
        }),
        feedback: {
          exact,
          misplaced,
          guessesLeft: puzzle.maxGuesses,
          solved: false,
          rerolled: true,
        },
      };
    }
    return {
      state: { used, solved: false },
      feedback: {
        exact,
        misplaced,
        guessesLeft: puzzle.maxGuesses - used,
        solved: false,
        rerolled: false,
      },
    };
  },
  answerSchema: z.array(z.number().int().min(0).max(MAX_DIGIT)).min(1).max(MAX_DIGITS),
  actionSchema: z.strictObject({
    guess: z.array(z.number().int().min(0).max(MAX_DIGIT)).min(1).max(MAX_DIGITS),
  }),
};

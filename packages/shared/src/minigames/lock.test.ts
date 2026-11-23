import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import { createRng } from '../rng';
import { lock, type LockCode, type LockFeedback, type LockState, scoreGuess } from './lock';
import { eraseMinigame } from './types';
import { CTX } from './testCtx';

const params = DEFAULT_CONFIG;
const game = eraseMinigame(lock);

describe('scoreGuess', () => {
  it.each([
    [[1, 2, 3], [1, 2, 3], 3, 0],
    [[1, 2, 3], [3, 1, 2], 0, 3],
    [[1, 2, 3], [1, 3, 2], 1, 2],
    [[1, 1, 2], [1, 2, 1], 1, 2],
    [[1, 1, 2], [2, 2, 2], 1, 0],
    [[1, 1, 2], [1, 1, 1], 2, 0],
    [[4, 4, 4], [0, 0, 0], 0, 0],
    [[0, 1, 0], [1, 0, 0], 1, 2],
  ])('code %j vs guess %j → %i exact, %i misplaced', (code, guess, exact, misplaced) => {
    expect(scoreGuess(code, guess)).toEqual({ exact, misplaced });
  });
});

interface Session {
  puzzle: unknown;
  solution: unknown;
  state: unknown;
}

function start(seed: number): Session {
  const g = game.generate(createRng(seed), 1, params, CTX);
  return { ...g, state: undefined };
}

function guess(s: Session, digits: number[], rng = createRng(99)): LockFeedback {
  const res = game.act(s.puzzle, s.solution, s.state, { guess: digits }, rng, CTX);
  if (res === 'invalid') throw new Error('invalid action');
  s.state = res.state;
  if (res.solution !== undefined) s.solution = res.solution;
  return res.feedback as LockFeedback;
}

describe('lock', () => {
  it('uses the configured length and digit range, deterministically', () => {
    const a = start(5);
    expect(a.puzzle).toEqual({
      digits: params.lockDigits,
      maxDigit: params.lockDigitMax,
      maxGuesses: params.lockMaxGuesses,
    });
    const code = a.solution as LockCode;
    expect(code).toHaveLength(params.lockDigits);
    expect(code.every((d) => d >= 0 && d <= params.lockDigitMax)).toBe(true);
    expect(start(5).solution).toEqual(code);
  });

  it('the final answer only counts after a guess matched the code', () => {
    const s = start(1);
    const code = s.solution as LockCode;
    // Submitting the right code without having guessed it is refused.
    expect(game.check(s.puzzle, s.solution, code, s.state, CTX)).toBe('wrong');
    const fb = guess(s, code);
    expect(fb).toMatchObject({ exact: params.lockDigits, solved: true });
    expect(game.check(s.puzzle, s.solution, code, s.state, CTX)).toBe('right');
    // A different code never passes, even when solved.
    expect(
      game.check(
        s.puzzle,
        s.solution,
        code.map((d) => (d + 1) % 6),
        s.state,
        CTX,
      ),
    ).toBe('wrong');
  });

  it('counts down the guesses and re-rolls the code after the last wrong one', () => {
    const s = start(2);
    const first = s.solution as LockCode;
    const wrong = first.map((d) => (d + 1) % (params.lockDigitMax + 1));
    for (let i = 1; i < params.lockMaxGuesses; i++) {
      expect(guess(s, wrong)).toMatchObject({
        guessesLeft: params.lockMaxGuesses - i,
        rerolled: false,
      });
    }
    const last = guess(s, wrong, createRng(1234));
    expect(last).toMatchObject({ rerolled: true, guessesLeft: params.lockMaxGuesses });
    expect((s.state as LockState).used).toBe(0);
    // A re-roll that came out the same would let the old guesses count: it must differ for this seed.
    expect(s.solution).not.toEqual(first);
  });

  it('a malformed guess costs nothing and is not a solve', () => {
    const s = start(3);
    const fb = guess(s, [1]);
    expect(fb).toMatchObject({ solved: false, guessesLeft: params.lockMaxGuesses });
    expect(guess(s, [9, 9, 9])).toMatchObject({ solved: false });
  });

  it('rejects an action that is not a guess', () => {
    const s = start(4);
    expect(game.act(s.puzzle, s.solution, s.state, { guess: 'abc' }, createRng(1), CTX)).toBe('invalid');
    expect(
      game.act(s.puzzle, s.solution, s.state, { guess: [1, 2, 3], extra: 1 }, createRng(1), CTX),
    ).toBe('invalid');
  });

  it('can always be solved within the guess budget (consistent-guess strategy, every code)', () => {
    const all: number[][] = [];
    const n = params.lockDigitMax + 1;
    for (let i = 0; i < n ** params.lockDigits; i++) {
      all.push(Array.from({ length: params.lockDigits }, (_, k) => Math.floor(i / n ** k) % n));
    }
    let worst = 0;
    for (const secret of all) {
      let candidates = all;
      let tries = 0;
      for (;;) {
        const pick = candidates[0] as number[];
        tries++;
        const fb = scoreGuess(secret, pick);
        if (fb.exact === params.lockDigits) break;
        candidates = candidates.filter((c) => {
          const s = scoreGuess(c, pick);
          return s.exact === fb.exact && s.misplaced === fb.misplaced;
        });
      }
      worst = Math.max(worst, tries);
    }
    expect(worst).toBeLessThanOrEqual(params.lockMaxGuesses);
  });
});

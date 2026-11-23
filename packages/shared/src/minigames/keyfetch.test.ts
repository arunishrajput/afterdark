import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import { createRng } from '../rng';
import { eraseMinigame } from './types';
import { keyfetch, type KeyFeedback, type KeyState } from './keyfetch';
import type { TaskContext } from './types';

const at = (gameMs: number, keyHeld = false): TaskContext => ({ gameMs, keyHeld });
const rng = createRng(1);
const holdMs = DEFAULT_CONFIG.keyHoldS * 1000;

describe('keyfetch (Key Fetch)', () => {
  it('shows leg 1 (pick up) until the key is held, then leg 2 (turn it)', () => {
    const one = keyfetch.generate(createRng(2), 1, DEFAULT_CONFIG, at(0));
    const two = keyfetch.generate(createRng(2), 1, DEFAULT_CONFIG, at(0, true));
    expect(one.puzzle.leg).toBe(1);
    expect(two.puzzle.leg).toBe(2);
    expect(one.puzzle.holdS).toBe(DEFAULT_CONFIG.keyHoldS);
    expect(two.puzzle.turns).toHaveLength(DEFAULT_CONFIG.keyTurnSteps);
    expect(two.solution).toEqual(two.puzzle.turns);
    expect(two.puzzle.turns.every((t) => t === 'L' || t === 'R')).toBe(true);
  });

  it('picks the key up only after holding for keyHoldS of game time since the grab began', () => {
    const { puzzle, solution } = keyfetch.generate(createRng(3), 1, DEFAULT_CONFIG, at(0));
    const grab = keyfetch.act?.(puzzle, solution, undefined, { step: 'grab' }, rng, at(10_000));
    expect(grab?.feedback).toEqual({ picked: false });
    const state = grab?.state as KeyState;
    const early = keyfetch.act?.(
      puzzle,
      solution,
      state,
      { step: 'pickup' },
      rng,
      at(10_000 + holdMs - 1),
    );
    expect(early?.feedback).toEqual<KeyFeedback>({ picked: false });
    const done = keyfetch.act?.(
      puzzle,
      solution,
      state,
      { step: 'pickup' },
      rng,
      at(10_000 + holdMs),
    );
    expect(done?.feedback).toEqual<KeyFeedback>({ picked: true });
  });

  it('refuses a pickup that was never grabbed, and a grab on leg 2', () => {
    const one = keyfetch.generate(createRng(3), 1, DEFAULT_CONFIG, at(0));
    const blind = keyfetch.act?.(
      one.puzzle,
      one.solution,
      undefined,
      { step: 'pickup' },
      rng,
      at(99_000),
    );
    expect(blind?.feedback).toEqual({ picked: false });
    const two = keyfetch.generate(createRng(3), 1, DEFAULT_CONFIG, at(0, true));
    const grab = keyfetch.act?.(
      two.puzzle,
      two.solution,
      undefined,
      { step: 'grab' },
      rng,
      at(0, true),
    );
    expect(grab?.feedback).toEqual({ picked: false });
    expect((grab?.state as KeyState | undefined)?.grabbedAtMs).toBeUndefined();
  });

  it('a new grab restarts the hold', () => {
    const { puzzle, solution } = keyfetch.generate(createRng(3), 1, DEFAULT_CONFIG, at(0));
    const first = keyfetch.act?.(puzzle, solution, undefined, { step: 'grab' }, rng, at(0));
    const second = keyfetch.act?.(
      puzzle,
      solution,
      first?.state as KeyState,
      { step: 'grab' },
      rng,
      at(2_000),
    );
    const early = keyfetch.act?.(
      puzzle,
      solution,
      second?.state as KeyState,
      { step: 'pickup' },
      rng,
      at(holdMs),
    );
    expect(early?.feedback).toEqual({ picked: false });
  });

  it('verifies the turns on leg 2 only', () => {
    const two = keyfetch.generate(createRng(4), 1, DEFAULT_CONFIG, at(0, true));
    expect(
      keyfetch.verify(two.puzzle, two.solution, [...two.solution], undefined, at(0, true)),
    ).toBe(true);
    const wrong = two.solution.map((t) => (t === 'L' ? 'R' : 'L'));
    expect(keyfetch.verify(two.puzzle, two.solution, wrong, undefined, at(0, true))).toBe(false);
    expect(
      keyfetch.verify(two.puzzle, two.solution, two.solution.slice(1), undefined, at(0, true)),
    ).toBe(false);
    const one = keyfetch.generate(createRng(4), 1, DEFAULT_CONFIG, at(0));
    expect(keyfetch.verify(one.puzzle, one.solution, [...one.solution], undefined, at(0))).toBe(
      false,
    );
  });

  it('parses through the erased wrapper: bad answers and actions are invalid', () => {
    const erased = eraseMinigame(keyfetch);
    expect(erased.hasActions).toBe(true);
    const { puzzle, solution } = erased.generate(createRng(5), 1, DEFAULT_CONFIG, at(0, true));
    expect(erased.check(puzzle, solution, solution, undefined, at(0, true))).toBe('right');
    expect(erased.check(puzzle, solution, ['X'], undefined, at(0, true))).toBe('invalid');
    expect(erased.act(puzzle, solution, undefined, { step: 'fly' }, rng, at(0))).toBe('invalid');
  });
});

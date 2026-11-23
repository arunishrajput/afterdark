import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import { createRng } from '../rng';
import { SIGNAL_WORDS } from './data/signalWords';
import { candidatesFor, decodeWith, signal, SIGNAL_GLYPH_COUNT } from './signal';
import { CTX } from './testCtx';
import { eraseMinigame } from './types';

const gen = (seed: number) => signal.generate(createRng(seed), 1, DEFAULT_CONFIG, CTX);

describe('signal word list', () => {
  it('holds 4 or 5 upper-case letters per word, with no duplicates', () => {
    for (const w of SIGNAL_WORDS) expect(w).toMatch(/^[A-Z]{4,5}$/);
    expect(new Set(SIGNAL_WORDS).size).toBe(SIGNAL_WORDS.length);
    expect(SIGNAL_WORDS.length).toBeGreaterThanOrEqual(60);
  });
});

describe('signal (Signal Decode)', () => {
  it('encodes a listed word with one symbol per distinct letter', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { puzzle, solution } = gen(seed);
      expect(SIGNAL_WORDS).toContain(solution);
      expect(puzzle.symbols).toHaveLength(solution.length);
      const letterOf = new Map<number, string>();
      puzzle.symbols.forEach((sym, i) => {
        expect(sym).toBeGreaterThanOrEqual(0);
        expect(sym).toBeLessThan(SIGNAL_GLYPH_COUNT);
        const letter = solution[i] as string;
        // The same symbol is always the same letter, and the other way round.
        expect(letterOf.get(sym) ?? letter).toBe(letter);
        letterOf.set(sym, letter);
      });
      expect(new Set(letterOf.values()).size).toBe(letterOf.size);
    }
  });

  it('is always uniquely solvable from the pattern, the partial key and the word list', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const { puzzle, solution } = gen(seed);
      const found = candidatesFor(puzzle, SIGNAL_WORDS);
      expect(found).toEqual([solution]);
    }
  });

  it('reveals about signalKeyFraction of the distinct letters, never all and never none', () => {
    let revealed = 0;
    let distinct = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const { puzzle, solution } = gen(seed);
      const d = new Set(solution).size;
      const k = Object.keys(puzzle.key).length;
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeLessThan(d);
      for (const [sym, letter] of Object.entries(puzzle.key)) {
        expect(puzzle.symbols.some((s, i) => String(s) === sym && solution[i] === letter)).toBe(
          true,
        );
      }
      revealed += k;
      distinct += d;
    }
    expect(revealed / distinct).toBeGreaterThan(0.5);
    expect(revealed / distinct).toBeLessThan(0.8);
  });

  it('does not leak the answer in the puzzle', () => {
    const { puzzle, solution } = gen(8);
    expect(JSON.stringify(puzzle)).not.toContain(solution);
    expect(decodeWith(puzzle, puzzle.key)).not.toBe(solution);
  });

  it('is deterministic for a seed', () => {
    expect(gen(5)).toEqual(gen(5));
  });

  it('checks the word case-insensitively and rejects anything else', () => {
    const { puzzle, solution } = gen(12);
    expect(signal.verify(puzzle, solution, solution, undefined, CTX)).toBe(true);
    expect(signal.verify(puzzle, solution, solution.toLowerCase(), undefined, CTX)).toBe(true);
    expect(signal.verify(puzzle, solution, `${solution.slice(1)}Z`, undefined, CTX)).toBe(false);
    expect(signal.verify(puzzle, solution, solution.slice(1), undefined, CTX)).toBe(false);
  });

  it('parses answers: 4 to 5 letters only', () => {
    const erased = eraseMinigame(signal);
    const { puzzle, solution } = gen(2);
    expect(erased.check(puzzle, solution, solution, undefined, CTX)).toBe('right');
    expect(erased.check(puzzle, solution, 'AB', undefined, CTX)).toBe('invalid');
    expect(erased.check(puzzle, solution, 'ABC1D', undefined, CTX)).toBe('invalid');
    expect(erased.check(puzzle, solution, 'ABCDEFG', undefined, CTX)).toBe('invalid');
    expect(erased.check(puzzle, solution, 42, undefined, CTX)).toBe('invalid');
  });
});

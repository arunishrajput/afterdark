/**
 * Signal Decode (TASKS §4): a 4–5 letter word is shown as symbols, one symbol per
 * distinct letter, with a partial key (about `signalKeyFraction` of the distinct
 * letters). The player types the word. The generator only ships a puzzle whose
 * pattern and partial key match exactly one word of the curated list, so the
 * answer is unique; if the first key leaves several, it reveals more letters.
 */
import { z } from 'zod';

import type { Rng } from '../rng';
import { SIGNAL_WORDS } from './data/signalWords';
import type { MinigameDef, MinigameParams } from './types';

/** How many distinct symbols exist (the client draws glyph `n` for symbol `n`). */
export const SIGNAL_GLYPH_COUNT = 12;
const MIN_LETTERS = 4;
const MAX_LETTERS = 5;

export interface SignalPuzzle {
  /** One symbol number (0 to `SIGNAL_GLYPH_COUNT - 1`) per letter of the word. */
  symbols: number[];
  /** Revealed symbols: symbol number (as text) → letter. */
  key: Record<string, string>;
}

/** The words that fit a puzzle: the same length, the same repeat pattern, and the revealed letters. */
export function candidatesFor(puzzle: SignalPuzzle, words: readonly string[]): string[] {
  return words.filter((w) => {
    if (w.length !== puzzle.symbols.length) return false;
    const letterOf = new Map<number, string>();
    const symbolOf = new Map<string, number>();
    for (let i = 0; i < w.length; i++) {
      const sym = puzzle.symbols[i] as number;
      const letter = w[i] as string;
      if ((letterOf.get(sym) ?? letter) !== letter) return false;
      if ((symbolOf.get(letter) ?? sym) !== sym) return false;
      letterOf.set(sym, letter);
      symbolOf.set(letter, sym);
      const known = puzzle.key[String(sym)];
      if (known !== undefined && known !== letter) return false;
    }
    return true;
  });
}

/** The word with `key` applied; unknown symbols show as `_`. */
export function decodeWith(puzzle: SignalPuzzle, key: Record<string, string>): string {
  return puzzle.symbols.map((s) => key[String(s)] ?? '_').join('');
}

export function generateSignal(
  rng: Rng,
  params: Pick<MinigameParams, 'signalKeyFraction'>,
  words: readonly string[] = SIGNAL_WORDS,
): { puzzle: SignalPuzzle; solution: string } {
  const word = rng.pick(words);
  const letters = [...new Set(word)];
  const glyphs = rng.shuffle(Array.from({ length: SIGNAL_GLYPH_COUNT }, (_, i) => i));
  const symbolOf = new Map(letters.map((l, i) => [l, glyphs[i] as number]));
  const symbols = [...word].map((l) => symbolOf.get(l) as number);

  // Reveal at least one and leave at least one hidden; raise the count until the answer is unique.
  const most = letters.length - 1;
  const want = Math.min(most, Math.max(1, Math.round(letters.length * params.signalKeyFraction)));
  for (let reveal = want; reveal <= most; reveal++) {
    // Try a few random choices of which letters to reveal before revealing more.
    const tries = reveal === most ? 1 : 12;
    for (let t = 0; t < tries; t++) {
      const chosen = rng.shuffle(letters).slice(0, reveal);
      const key = Object.fromEntries(chosen.map((l) => [String(symbolOf.get(l)), l]));
      const puzzle: SignalPuzzle = { symbols, key };
      const fits = candidatesFor(puzzle, words);
      if (fits.length === 1) return { puzzle, solution: word };
    }
  }
  // Even all-but-one letters left two words (a near-twin pair in the list): pick another word.
  return generateSignal(rng, params, words);
}

export const signal: MinigameDef<SignalPuzzle, string, string> = {
  type: 'signal',
  generate: (rng, _difficulty, params) => generateSignal(rng, params),
  verify: (_puzzle, solution, answer) => answer.toUpperCase() === solution,
  answerSchema: z
    .string()
    .regex(/^[A-Za-z]+$/)
    .min(MIN_LETTERS)
    .max(MAX_LETTERS),
};

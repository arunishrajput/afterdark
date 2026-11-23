/**
 * Signal Decode (TASKS §4): a word in symbols, with some letters already decoded.
 * Tap a symbol, then a letter on the keypad; the same symbol is the same letter
 * everywhere. Each symbol has a shape and a name, so colour is never needed.
 */
import type { SignalPuzzle } from '@afterdark/shared';
import { useState } from 'react';

import { Button } from '../ui/Button';
import { LetterPad } from './LetterPad';
import type { MinigameProps } from './types';

/** Symbol number → drawn glyph and its spoken name (the server sends numbers only). */
const GLYPHS = [
  ['●', 'circle'],
  ['■', 'square'],
  ['▲', 'triangle'],
  ['★', 'star'],
  ['◆', 'diamond'],
  ['✚', 'cross'],
  ['♥', 'heart'],
  ['☾', 'moon'],
  ['⬟', 'pentagon'],
  ['⬢', 'hexagon'],
  ['✿', 'flower'],
  ['☗', 'flag'],
] as const;

export default function SignalDecode({
  puzzle,
  onSubmit,
  disabled,
}: MinigameProps<SignalPuzzle, string>) {
  const unknown = [...new Set(puzzle.symbols)].filter((s) => puzzle.key[String(s)] === undefined);
  const [guess, setGuess] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<number | undefined>(unknown[0]);

  const letterOf = (sym: number) => puzzle.key[String(sym)] ?? guess[sym] ?? '';
  const word = puzzle.symbols.map(letterOf).join('');
  const complete = puzzle.symbols.every((s) => letterOf(s) !== '');

  const nextUnfilled = (after: number) => unknown.find((s) => s !== after && !guess[s]) ?? after;

  const type = (letter: string) => {
    if (disabled || selected === undefined) return;
    setGuess((g) => ({ ...g, [selected]: letter }));
    setSelected(nextUnfilled(selected));
  };
  const erase = () => {
    if (disabled || selected === undefined) return;
    setGuess((g) => ({ ...g, [selected]: '' }));
  };

  return (
    <div data-testid="minigame-signal" className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Decode the word. Some symbols are already solved; tap another symbol, then a letter.
      </p>
      <div role="group" aria-label="Encoded word" className="flex justify-center gap-2">
        {puzzle.symbols.map((sym, i) => {
          const [glyph, name] = GLYPHS[sym] ?? ['?', 'unknown'];
          const known = puzzle.key[String(sym)] !== undefined;
          const letter = letterOf(sym);
          const isSelected = selected === sym;
          return (
            <button
              key={i}
              type="button"
              data-testid={`signal-sym-${i}`}
              data-known={known}
              disabled={known || disabled}
              aria-label={`Symbol ${i + 1}, ${name}, ${letter ? `letter ${letter}` : 'not decoded'}${known ? ', given' : ''}`}
              aria-pressed={isSelected}
              onClick={() => setSelected(sym)}
              className={`flex min-h-24 w-14 touch-manipulation flex-col items-center justify-between rounded-xl border-2 py-2 ${
                isSelected ? 'border-accent bg-accent/20' : 'border-white/15 bg-surface'
              }`}
            >
              <span aria-hidden="true" className="text-3xl leading-none">
                {glyph}
              </span>
              <span className="font-mono text-2xl font-bold">{letter || '·'}</span>
            </button>
          );
        })}
      </div>
      <ul
        className="flex flex-wrap justify-center gap-2 text-sm"
        aria-label="Symbols already decoded"
      >
        {Object.entries(puzzle.key).map(([sym, letter]) => (
          <li key={sym} className="rounded-lg bg-bg px-2 py-1">
            <span aria-hidden="true">{GLYPHS[Number(sym)]?.[0]}</span>{' '}
            <span className="text-muted">{GLYPHS[Number(sym)]?.[1]} =</span>{' '}
            <span className="font-mono font-bold">{letter}</span>
          </li>
        ))}
      </ul>
      <LetterPad onLetter={type} onBackspace={erase} disabled={disabled} />
      <Button
        data-testid="signal-submit"
        disabled={disabled || !complete}
        onClick={() => onSubmit(word)}
      >
        {complete ? `Send "${word}"` : 'Fill every symbol'}
      </Button>
    </div>
  );
}

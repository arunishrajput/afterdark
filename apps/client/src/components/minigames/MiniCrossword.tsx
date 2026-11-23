/**
 * Mini Crossword (TASKS §4): tap a cell, type with the on-screen keypad. Tapping the
 * selected cell again flips between across and down. The clue for the selected
 * word is always shown, with its number, so nothing relies on colour alone.
 */
import type { CrosswordEntry, CrosswordPuzzle } from '@afterdark/shared';
import { useMemo, useState } from 'react';

import { Button } from '../ui/Button';
import { LetterPad } from './LetterPad';
import type { MinigameProps } from './types';

type Dir = 'across' | 'down';
type Cell = { row: number; col: number };

const BLOCK = '#';

export default function MiniCrossword({
  puzzle,
  onSubmit,
  disabled,
}: MinigameProps<CrosswordPuzzle, string[]>) {
  const size = puzzle.size;
  const open = (r: number, c: number) => puzzle.blocks[r]?.[c] === '.';
  const firstCell = useMemo<Cell>(() => {
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) if (open(r, c)) return { row: r, col: c };
    return { row: 0, col: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle]);
  const [letters, setLetters] = useState<Record<string, string>>({});
  const [at, setAt] = useState<Cell>(firstCell);
  const [dir, setDir] = useState<Dir>('across');

  const key = (r: number, c: number) => `${r},${c}`;
  const entries = (d: Dir): CrosswordEntry[] => (d === 'across' ? puzzle.across : puzzle.down);
  /** The entry of direction `d` that covers a cell. */
  const entryAt = (d: Dir, r: number, c: number) =>
    entries(d).find((e) =>
      d === 'across'
        ? e.row === r && c >= e.col && c < e.col + e.len
        : e.col === c && r >= e.row && r < e.row + e.len,
    );
  // The direction in use must have a word at the cell; otherwise use the other one.
  const dirHere: Dir = entryAt(dir, at.row, at.col) ? dir : dir === 'across' ? 'down' : 'across';
  const current = entryAt(dirHere, at.row, at.col);

  const total = puzzle.blocks
    .join('')
    .split('')
    .filter((ch) => ch === '.').length;
  const filled = Object.values(letters).filter(Boolean).length;
  const complete = filled === total;

  const tapCell = (r: number, c: number) => {
    if (!open(r, c)) return;
    if (r === at.row && c === at.col) setDir(dirHere === 'across' ? 'down' : 'across');
    setAt({ row: r, col: c });
  };

  const step = (by: 1 | -1): Cell => {
    const next = {
      row: at.row + (dirHere === 'down' ? by : 0),
      col: at.col + (dirHere === 'across' ? by : 0),
    };
    return open(next.row, next.col) ? next : at;
  };

  const type = (letter: string) => {
    if (disabled) return;
    setLetters((l) => ({ ...l, [key(at.row, at.col)]: letter }));
    setAt(step(1));
  };
  const erase = () => {
    if (disabled) return;
    const here = letters[key(at.row, at.col)];
    if (here) setLetters((l) => ({ ...l, [key(at.row, at.col)]: '' }));
    else {
      const back = step(-1);
      setLetters((l) => ({ ...l, [key(back.row, back.col)]: '' }));
      setAt(back);
    }
  };

  const answer = () =>
    puzzle.blocks.map((row, r) =>
      [...row].map((ch, c) => (ch === BLOCK ? BLOCK : (letters[key(r, c)] ?? ' '))).join(''),
    );

  const starts = new Map<string, number>();
  for (const e of [...puzzle.across, ...puzzle.down]) starts.set(key(e.row, e.col), e.n);

  return (
    <div data-testid="minigame-crossword" className="flex flex-col gap-3">
      <p
        role="status"
        data-testid="crossword-clue"
        className="rounded-lg bg-bg px-3 py-2 text-sm font-semibold"
      >
        {current
          ? `${current.n} ${dirHere === 'across' ? 'Across' : 'Down'} (${current.len}): ${current.clue}`
          : 'Tap a square'}
      </p>
      <div
        role="grid"
        aria-label="Crossword grid"
        className="mx-auto grid w-full max-w-[18rem] gap-1"
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
      >
        {puzzle.blocks.flatMap((row, r) =>
          [...row].map((ch, c) => {
            if (ch === BLOCK) {
              return (
                <div
                  key={key(r, c)}
                  aria-hidden="true"
                  className="aspect-square rounded-md bg-white/10"
                />
              );
            }
            const selected = r === at.row && c === at.col;
            const inWord = current
              ? dirHere === 'across'
                ? r === current.row && c >= current.col && c < current.col + current.len
                : c === current.col && r >= current.row && r < current.row + current.len
              : false;
            const letter = letters[key(r, c)] ?? '';
            const n = starts.get(key(r, c));
            return (
              <button
                key={key(r, c)}
                type="button"
                role="gridcell"
                data-testid={`xw-${r}-${c}`}
                aria-label={`Row ${r + 1}, column ${c + 1}${n ? `, clue ${n}` : ''}, ${letter || 'empty'}`}
                aria-selected={selected}
                onClick={() => tapCell(r, c)}
                className={`relative aspect-square min-h-14 touch-manipulation rounded-md border-2 font-mono text-2xl font-bold uppercase ${
                  selected
                    ? 'border-accent bg-accent/20'
                    : inWord
                      ? 'border-white/40 bg-surface'
                      : 'border-white/15 bg-surface'
                }`}
              >
                {n && (
                  <span className="absolute top-0.5 left-1 text-[0.6rem] font-semibold text-muted">
                    {n}
                  </span>
                )}
                {letter}
              </button>
            );
          }),
        )}
      </div>
      <LetterPad onLetter={type} onBackspace={erase} disabled={disabled} />
      <ul className="grid gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-2">
        {(['across', 'down'] as const).flatMap((d) =>
          entries(d).map((e) => (
            <li key={`${d}${e.n}`}>
              <span className="font-semibold text-text">
                {e.n} {d === 'across' ? 'Across' : 'Down'}:
              </span>{' '}
              {e.clue}
            </li>
          )),
        )}
      </ul>
      <Button
        data-testid="crossword-submit"
        disabled={disabled || !complete}
        onClick={() => onSubmit(answer())}
      >
        {complete ? 'Check' : `${total - filled} left to fill`}
      </Button>
    </div>
  );
}

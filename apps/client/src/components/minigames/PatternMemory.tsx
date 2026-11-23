/**
 * Pattern Memory (TASKS §4): the pad flashes a sequence (each flash also shows its
 * step number, so colour is never the only cue), then the player repeats it. The
 * server checks the replay. "Watch again" is always available; it costs nothing.
 */
import type { PatternPuzzle } from '@afterdark/shared';
import { useEffect, useState } from 'react';

import { Button } from '../ui/Button';
import type { MinigameProps } from './types';

const START_DELAY_MS = 600;
const FLASH_MS = 650;
const GAP_MS = 250;
const COLUMNS = 3;

export default function PatternMemory({
  puzzle,
  onSubmit,
  disabled,
}: MinigameProps<PatternPuzzle, number[]>) {
  const [watch, setWatch] = useState(0); // bump to replay
  /** Index of the step being flashed, or -1 between flashes, or undefined when not playing back. */
  const [lit, setLit] = useState<number | undefined>(-1);
  const [taps, setTaps] = useState<number[]>([]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    puzzle.sequence.forEach((_, i) => {
      const on = START_DELAY_MS + i * (FLASH_MS + GAP_MS);
      timers.push(setTimeout(() => setLit(i), on));
      timers.push(setTimeout(() => setLit(-1), on + FLASH_MS));
    });
    timers.push(
      setTimeout(
        () => setLit(undefined),
        START_DELAY_MS + puzzle.sequence.length * (FLASH_MS + GAP_MS),
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [puzzle.sequence, watch]);

  const watching = lit !== undefined;
  const litCell = lit !== undefined && lit >= 0 ? puzzle.sequence[lit] : undefined;

  const tap = (cell: number) => {
    if (watching || disabled) return;
    const next = [...taps, cell];
    if (next.length >= puzzle.sequence.length) {
      setTaps([]);
      onSubmit(next);
    } else setTaps(next);
  };

  return (
    <div data-testid="minigame-pattern" className="flex flex-col gap-4">
      <p className="text-sm text-muted" role="status" data-testid="pattern-status">
        {watching
          ? 'Watch the pad. Remember the order.'
          : `Repeat it: tap ${puzzle.sequence.length} squares in the same order.`}
      </p>
      <div
        role="group"
        aria-label="Pattern pad"
        className="mx-auto grid w-full max-w-xs gap-2"
        style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: puzzle.pad }, (_, cell) => {
          const on = litCell === cell;
          const tapped = taps.filter((t) => t === cell).length;
          return (
            <button
              key={cell}
              type="button"
              data-testid={`pattern-cell-${cell}`}
              data-lit={on}
              aria-label={`Square ${cell + 1}${on ? ', lit' : ''}`}
              disabled={watching || disabled}
              onClick={() => tap(cell)}
              className={`aspect-square min-h-16 touch-manipulation rounded-xl border-2 font-mono text-2xl font-bold transition active:scale-95 ${
                on ? 'border-accent bg-accent text-bg' : 'border-white/15 bg-surface text-muted'
              }`}
            >
              {on && lit !== undefined ? lit + 1 : tapped > 0 ? '•' : ''}
            </button>
          );
        })}
      </div>
      <p
        className="text-center font-mono text-lg"
        aria-live="polite"
        data-testid="pattern-progress"
      >
        {Array.from({ length: puzzle.sequence.length }, (_, i) =>
          i < taps.length ? '●' : '○',
        ).join(' ')}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          data-testid="pattern-replay"
          disabled={watching || disabled}
          onClick={() => {
            setTaps([]);
            setLit(-1);
            setWatch((n) => n + 1);
          }}
        >
          Watch again
        </Button>
        <Button
          variant="ghost"
          className="flex-1"
          data-testid="pattern-clear"
          disabled={watching || disabled || taps.length === 0}
          onClick={() => setTaps([])}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}

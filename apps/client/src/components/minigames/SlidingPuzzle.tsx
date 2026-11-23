/**
 * Sliding Puzzle (TASKS §4): tap a tile next to the gap to slide it in. The numbers
 * are the cue (no colour needed). The moves are sent to the server, which replays
 * them; "Start over" puts the board back as it was.
 */
import { applySlideMoves, isSlideSolved, type SlidePuzzle } from '@afterdark/shared';
import { useState } from 'react';

import { Button } from '../ui/Button';
import type { MinigameProps } from './types';

export default function SlidingPuzzle({
  puzzle,
  onSubmit,
  disabled,
}: MinigameProps<SlidePuzzle, number[]>) {
  const [moves, setMoves] = useState<number[]>([]);
  const tiles = applySlideMoves(puzzle.tiles, moves) ?? puzzle.tiles;
  const solved = isSlideSolved(tiles);
  const size = puzzle.size;
  const gap = tiles.indexOf(0);

  const slide = (tile: number) => {
    if (disabled || solved) return;
    const next = [...moves, tile];
    if (!applySlideMoves(puzzle.tiles, next)) return; // not next to the gap: nothing happens
    setMoves(next);
  };

  const nextToGap = (i: number) =>
    Math.abs(Math.floor(i / size) - Math.floor(gap / size)) +
      Math.abs((i % size) - (gap % size)) ===
    1;

  return (
    <div data-testid="minigame-slide" className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Slide the tiles into order, 1 to 8, with the gap in the bottom right corner.
      </p>
      <div
        role="group"
        aria-label="Sliding puzzle board"
        className="mx-auto grid w-full max-w-xs gap-2"
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
      >
        {tiles.map((tile, i) =>
          tile === 0 ? (
            <div
              key="gap"
              data-testid="slide-gap"
              aria-label="Gap"
              className="aspect-square rounded-xl border border-dashed border-white/15"
            />
          ) : (
            <button
              key={tile}
              type="button"
              data-testid={`slide-tile-${tile}`}
              aria-label={`Tile ${tile}${nextToGap(i) ? ', can slide' : ''}`}
              disabled={disabled || solved}
              onClick={() => slide(tile)}
              className={`aspect-square min-h-16 touch-manipulation rounded-xl border font-mono text-3xl font-bold tabular-nums transition active:scale-95 ${
                nextToGap(i)
                  ? 'border-accent bg-surface text-text'
                  : 'border-white/15 bg-surface text-muted'
              }`}
            >
              {tile}
            </button>
          ),
        )}
      </div>
      <p className="text-center text-sm text-muted" role="status" data-testid="slide-moves">
        {moves.length} {moves.length === 1 ? 'move' : 'moves'}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          data-testid="slide-reset"
          disabled={disabled || moves.length === 0}
          onClick={() => setMoves([])}
        >
          Start over
        </Button>
        <Button
          className="flex-1"
          data-testid="slide-submit"
          disabled={disabled || !solved}
          onClick={() => onSubmit(moves)}
        >
          {solved ? 'Done' : 'Solve it first'}
        </Button>
      </div>
    </div>
  );
}

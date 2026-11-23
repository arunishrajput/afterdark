/**
 * Key Fetch (TASKS §4). Leg 1, at Point 1: hold "Pick up key" for the whole time
 * (the server times it on game time; lifting your finger starts again). Leg 2, at
 * Point 2: turn the key left and right in the order shown. Words and arrows both
 * say which way, so colour is never the only cue.
 */
import type { KeyAction, KeyFeedback, KeyPuzzle, KeyTurn, KeyTurns } from '@afterdark/shared';
import { useEffect, useRef, useState } from 'react';

import { Button } from '../ui/Button';
import type { MinigameProps } from './types';

const MS_PER_S = 1000;
const TICK_MS = 100;
const LABEL: Record<KeyTurn, { arrow: string; word: string }> = {
  L: { arrow: '↺', word: 'Left' },
  R: { arrow: '↻', word: 'Right' },
};

function PickUp({
  puzzle,
  onAction,
  disabled,
}: Pick<
  MinigameProps<KeyPuzzle, KeyTurns, KeyAction, KeyFeedback>,
  'puzzle' | 'onAction' | 'disabled'
>) {
  const [holding, setHolding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const run = useRef(0);

  const stop = () => {
    run.current++;
    setHolding(false);
    setElapsed(0);
  };

  const begin = async () => {
    if (disabled || holding) return;
    const mine = ++run.current;
    setHolding(true);
    const grabbed = await onAction({ step: 'grab' });
    if (!grabbed || run.current !== mine) return;
    // The server timed the grab when it arrived, so counting from the reply is never short.
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (run.current !== mine) {
        clearInterval(timer);
        return;
      }
      const spent = Date.now() - startedAt;
      setElapsed(spent);
      if (spent >= puzzle.holdS * MS_PER_S) {
        clearInterval(timer);
        void onAction({ step: 'pickup' }).then((fb) => {
          if (run.current === mine && !fb?.picked) stop();
        });
      }
    }, TICK_MS);
  };

  useEffect(() => () => void run.current++, []);

  const left = Math.max(0, Math.ceil(puzzle.holdS - elapsed / MS_PER_S));
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-muted">
        Press and hold the button for {puzzle.holdS} seconds to pick up the key. Let go and you
        start again.
      </p>
      <button
        type="button"
        data-testid="key-pickup"
        data-holding={holding}
        disabled={disabled}
        aria-label={
          holding ? `Picking up the key, ${left} seconds left` : 'Hold to pick up the key'
        }
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          void begin();
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) void begin();
        }}
        onKeyUp={stop}
        className="relative grid size-40 touch-none place-items-center overflow-hidden rounded-full border-4 border-accent bg-surface font-display text-xl font-bold select-none disabled:opacity-40"
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 bg-accent/30"
          style={{ height: `${Math.min(100, (elapsed / (puzzle.holdS * MS_PER_S)) * 100)}%` }}
        />
        <span className="relative">{holding ? `${left} s` : 'Hold to pick up key'}</span>
      </button>
    </div>
  );
}

function Turn({
  puzzle,
  onSubmit,
  disabled,
}: Pick<
  MinigameProps<KeyPuzzle, KeyTurns, KeyAction, KeyFeedback>,
  'puzzle' | 'onSubmit' | 'disabled'
>) {
  const [entered, setEntered] = useState<KeyTurn[]>([]);
  const turn = (t: KeyTurn) => {
    if (disabled) return;
    const next = [...entered, t];
    if (next.length >= puzzle.turns.length) {
      setEntered([]);
      onSubmit(next);
    } else setEntered(next);
  };
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-muted">Turn the key in this order, one turn at a time.</p>
      <ol className="flex gap-2" aria-label="Turns to make" data-testid="key-sequence">
        {puzzle.turns.map((t, i) => (
          <li
            key={i}
            className={`grid size-16 place-items-center rounded-xl border-2 text-center ${
              i < entered.length ? 'border-accent bg-accent/20' : 'border-white/15 bg-surface'
            }`}
          >
            <span aria-hidden="true" className="text-3xl leading-none">
              {LABEL[t].arrow}
            </span>
            <span className="text-xs font-semibold">{LABEL[t].word}</span>
          </li>
        ))}
      </ol>
      <div className="flex w-full gap-2">
        {(['L', 'R'] as const).map((t) => (
          <Button
            key={t}
            variant="secondary"
            className="h-16 flex-1 text-lg"
            data-testid={`key-turn-${t}`}
            disabled={disabled}
            onClick={() => turn(t)}
          >
            {LABEL[t].arrow} Turn {LABEL[t].word.toLowerCase()}
          </Button>
        ))}
      </div>
      <Button
        variant="ghost"
        data-testid="key-clear"
        disabled={disabled || entered.length === 0}
        onClick={() => setEntered([])}
      >
        Clear
      </Button>
    </div>
  );
}

export default function KeyFetch(
  props: MinigameProps<KeyPuzzle, KeyTurns, KeyAction, KeyFeedback>,
) {
  return (
    <div
      data-testid="minigame-keyfetch"
      data-leg={props.puzzle.leg}
      className="flex flex-col gap-4"
    >
      <p className="text-center font-semibold" data-testid="key-leg">
        {props.puzzle.leg === 1 ? 'Step 1 of 2: get the key' : 'Step 2 of 2: use the key'}
      </p>
      {props.puzzle.leg === 1 ? <PickUp {...props} /> : <Turn {...props} />}
    </div>
  );
}

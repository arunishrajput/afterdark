/**
 * Wire Connect (TASKS §4): tap an end on the left, then the matching end on the
 * right (same colour and symbol). Tap a connected end to undo it. Taps work with
 * one hand and for screen readers, so v1 has no dragging. Every end is a 56 px
 * target and says "red circle" aloud.
 */
import type { WireEnd, WiresAnswer, WiresPuzzle } from '@afterdark/shared';
import { useLayoutEffect, useRef, useState } from 'react';

import { Button } from '../ui/Button';
import type { MinigameProps } from './types';
import { WIRE_HEX } from './wireColors';
import { WireSymbolIcon } from './WireSymbol';

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

const nameOf = (end: WireEnd) => `${end.color} ${end.symbol}`;

export default function Wires({
  puzzle,
  onSubmit,
  disabled,
}: MinigameProps<WiresPuzzle, WiresAnswer>) {
  /** left index → right index */
  const [links, setLinks] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState<number | undefined>();
  const [lines, setLines] = useState<Line[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const leftRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rightRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const count = puzzle.left.length;
  const done = Object.keys(links).length === count;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const next: Line[] = [];
      for (const [l, r] of Object.entries(links)) {
        const a = leftRefs.current[Number(l)]?.getBoundingClientRect();
        const b = rightRefs.current[r]?.getBoundingClientRect();
        const end = puzzle.left[Number(l)];
        if (!a || !b || !end) continue;
        next.push({
          x1: a.right - base.left,
          y1: a.top + a.height / 2 - base.top,
          x2: b.left - base.left,
          y2: b.top + b.height / 2 - base.top,
          color: WIRE_HEX[end.color],
        });
      }
      setLines(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [links, puzzle.left]);

  const tapLeft = (i: number) => {
    if (links[i] !== undefined) {
      setLinks(({ [i]: _gone, ...rest }) => rest);
      setSelected(undefined);
    } else setSelected(selected === i ? undefined : i);
  };

  const tapRight = (j: number) => {
    const entry = Object.entries(links).find(([, r]) => r === j);
    const owner = entry === undefined ? undefined : Number(entry[0]);
    if (selected === undefined) {
      // Tapping a connected end on the right undoes that connection.
      if (owner !== undefined) {
        setLinks((prev) => {
          const next = { ...prev };
          delete next[owner];
          return next;
        });
      }
      return;
    }
    setLinks((prev) => {
      const next = { ...prev };
      if (owner !== undefined) delete next[owner];
      next[selected] = j;
      return next;
    });
    setSelected(undefined);
  };

  const submit = () => onSubmit(puzzle.left.map((_, i) => links[i] ?? 0));

  return (
    <div data-testid="minigame-wires" className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Tap a wire on the left, then the matching wire on the right.
      </p>
      <div ref={box} className="relative flex justify-between gap-24 px-2 py-1">
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full">
          {lines.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={l.color}
              strokeWidth="5"
              strokeLinecap="round"
            />
          ))}
        </svg>
        <div className="relative z-10 flex flex-col gap-3">
          {puzzle.left.map((end, i) => (
            <button
              key={i}
              ref={(el) => {
                leftRefs.current[i] = el;
              }}
              type="button"
              data-testid={`wire-left-${i}`}
              data-connected={links[i] !== undefined}
              aria-label={`Left ${nameOf(end)}${links[i] === undefined ? '' : ', connected'}`}
              aria-pressed={selected === i}
              disabled={disabled}
              onClick={() => tapLeft(i)}
              className={`grid size-14 touch-manipulation place-items-center rounded-2xl border-2 bg-bg transition active:scale-95 disabled:opacity-50 ${selected === i ? 'border-white shadow-[0_0_16px_#fff]' : 'border-white/25'}`}
              style={{ outlineColor: WIRE_HEX[end.color] }}
            >
              <WireSymbolIcon color={end.color} symbol={end.symbol} />
            </button>
          ))}
        </div>
        <div className="relative z-10 flex flex-col gap-3">
          {puzzle.right.map((end, j) => (
            <button
              key={j}
              ref={(el) => {
                rightRefs.current[j] = el;
              }}
              type="button"
              data-testid={`wire-right-${j}`}
              aria-label={`Right ${nameOf(end)}`}
              disabled={disabled}
              onClick={() => tapRight(j)}
              className="grid size-14 touch-manipulation place-items-center rounded-2xl border-2 border-white/25 bg-bg transition active:scale-95 disabled:opacity-50"
            >
              <WireSymbolIcon color={end.color} symbol={end.symbol} />
            </button>
          ))}
        </div>
      </div>
      <Button data-testid="wires-submit" disabled={disabled || !done} onClick={submit}>
        Check wires
      </Button>
    </div>
  );
}

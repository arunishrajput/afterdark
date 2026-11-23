/** A circular progress ring (the Infect channel and cooldown). `fraction` is 0..1; not colour alone: the centre carries text. */
import type { ReactNode } from 'react';

const SIZE = 88;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ProgressRing({
  fraction,
  warn = false,
  small = false,
  children,
}: {
  fraction: number;
  /** Draw in the warning colour (the channel is in a gap). */
  warn?: boolean;
  /** The smaller ring used on the class-ability buttons. */
  small?: boolean;
  children?: ReactNode;
}) {
  const f = Math.min(1, Math.max(0, fraction));
  return (
    <span
      className={`relative grid place-items-center ${small ? 'size-16' : 'size-22'}`}
      aria-hidden="true"
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 -rotate-90">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="rgb(255 255 255 / 0.12)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={warn ? 'var(--danger)' : 'var(--accent)'}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - f)}
          style={{ transition: 'stroke-dashoffset 250ms linear' }}
        />
      </svg>
      <span className="relative text-center leading-tight">{children}</span>
    </span>
  );
}

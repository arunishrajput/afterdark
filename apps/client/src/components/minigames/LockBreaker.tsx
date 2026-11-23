/**
 * Lock Breaker (TASKS §4): set the digits, try the code, read the feedback. Each
 * try is a `task:action`; once the server says the code is right the answer is
 * submitted for real. After the last guess the lock re-rolls. Feedback is words
 * as well as pegs (● right place, ○ right digit, wrong place), never colour alone.
 */
import type { LockAction, LockFeedback, LockPuzzle } from '@afterdark/shared';
import { useState } from 'react';

import { Button } from '../ui/Button';
import type { MinigameProps } from './types';

interface Row {
  guess: number[];
  exact: number;
  misplaced: number;
}

function Pegs({ exact, misplaced, total }: { exact: number; misplaced: number; total: number }) {
  const blanks = Math.max(0, total - exact - misplaced);
  return (
    <span aria-hidden="true" className="font-mono tracking-widest">
      {'●'.repeat(exact)}
      {'○'.repeat(misplaced)}
      <span className="opacity-25">{'·'.repeat(blanks)}</span>
    </span>
  );
}

export default function LockBreaker({
  puzzle,
  onSubmit,
  onAction,
  disabled,
}: MinigameProps<LockPuzzle, number[], LockAction, LockFeedback>) {
  const [digits, setDigits] = useState<number[]>(() => Array<number>(puzzle.digits).fill(0));
  const [history, setHistory] = useState<Row[]>([]);
  const [left, setLeft] = useState(puzzle.maxGuesses);
  const [note, setNote] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const step = (i: number, by: number) =>
    setDigits((d) =>
      d.map((v, k) => (k === i ? (v + by + puzzle.maxDigit + 1) % (puzzle.maxDigit + 1) : v)),
    );

  const tryCode = async () => {
    setBusy(true);
    const feedback = await onAction({ guess: digits });
    setBusy(false);
    if (!feedback) return;
    if (feedback.solved) {
      setNote('Unlocked!');
      onSubmit(digits);
      return;
    }
    setHistory((h) => [
      ...h,
      { guess: digits, exact: feedback.exact, misplaced: feedback.misplaced },
    ]);
    setLeft(feedback.guessesLeft);
    if (feedback.rerolled) {
      setHistory([]);
      setNote('Out of tries: the lock picked a new code. Start again.');
    } else setNote(undefined);
  };

  return (
    <div data-testid="minigame-lock" className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Find the {puzzle.digits}-digit code (digits 0 to {puzzle.maxDigit}). ● is a right digit in
        the right place, ○ a right digit in the wrong place.
      </p>
      <div className="flex justify-center gap-3">
        {digits.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Button
              variant="secondary"
              aria-label={`Digit ${i + 1} up`}
              data-testid={`lock-up-${i}`}
              className="size-14 px-0"
              disabled={disabled || busy}
              onClick={() => step(i, 1)}
            >
              ▲
            </Button>
            <output
              data-testid={`lock-digit-${i}`}
              aria-label={`Digit ${i + 1}`}
              className="grid h-16 w-14 place-items-center rounded-xl border border-white/20 bg-bg font-mono text-3xl font-bold tabular-nums"
            >
              {d}
            </output>
            <Button
              variant="secondary"
              aria-label={`Digit ${i + 1} down`}
              data-testid={`lock-down-${i}`}
              className="size-14 px-0"
              disabled={disabled || busy}
              onClick={() => step(i, -1)}
            >
              ▼
            </Button>
          </div>
        ))}
      </div>
      <Button data-testid="lock-try" disabled={disabled || busy} onClick={() => void tryCode()}>
        Try this code · {left} {left === 1 ? 'try' : 'tries'} left
      </Button>
      {note && (
        <p role="status" data-testid="lock-note" className="text-center text-sm font-semibold">
          {note}
        </p>
      )}
      {history.length > 0 && (
        <ol data-testid="lock-history" className="flex flex-col gap-1">
          {history
            .slice()
            .reverse()
            .map((row, i) => (
              <li
                key={history.length - i}
                className="flex items-center justify-between rounded-lg bg-bg px-3 py-2 text-sm"
              >
                <span className="font-mono text-lg tabular-nums">{row.guess.join(' ')}</span>
                <Pegs exact={row.exact} misplaced={row.misplaced} total={puzzle.digits} />
                <span className="text-muted">
                  {row.exact} right place · {row.misplaced} wrong place
                </span>
              </li>
            ))}
        </ol>
      )}
    </div>
  );
}

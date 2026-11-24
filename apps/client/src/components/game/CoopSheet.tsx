/**
 * The co-op screen (UI_UX §2 › Co-op, TASKS §5): the PIN panel (show yours, type theirs) once both
 * players are in, then success. Waiting for the partner is not a screen: it shows on the task card,
 * so the map stays in view (ADR-104). It looks the same for a real partner and for a camouflaged
 * stand-in. The server checks the PIN; if it resets the session (a meeting, a Task Stop, someone
 * walking away) the view changes and the sheet follows it.
 */
import { DEFAULT_CONFIG, type PlayerView, type TaskCard } from '@afterdark/shared';
import { useEffect, useRef, useState } from 'react';

import { coopCancel, coopSubmit } from '../../net/actions';
import { messageFor } from '../../net/errors';
import { useGame } from '../../store';
import { Button } from '../ui/Button';

const MS_PER_S = 1000;
const CELEBRATE_MS = 1400;
const LOCKOUT_TICK_MS = 250;

/** What to call the other side: their tag when the viewer holds the card, else just "your partner". */
function partnerName(cards: readonly TaskCard[], taskId: string): string {
  return cards.find((c) => c.id === taskId)?.partnerTag ?? 'your partner';
}

/** The PIN sheet while a session is active, and a short "Co-op complete" once it ends in success. */
export function CoopLayer({ view }: { view: PlayerView }) {
  const coop = view.game?.coop;
  const doneSeq = useGame((s) => s.taskDone?.seq ?? 0);
  const [celebrate, setCelebrate] = useState<number | undefined>();
  // The seq when the session was last seen, so a completion that arrives as the session ends is noticed.
  const seen = useRef({ present: false, seq: doneSeq });

  useEffect(() => {
    const before = seen.current;
    if (coop) {
      if (!before.present) seen.current = { present: true, seq: doneSeq };
      return;
    }
    if (before.present) {
      seen.current = { present: false, seq: doneSeq };
      if (doneSeq > before.seq) {
        const points = useGame.getState().taskDone?.points ?? 0;
        setCelebrate(points);
        const t = setTimeout(() => setCelebrate(undefined), CELEBRATE_MS);
        return () => clearTimeout(t);
      }
    }
    return undefined;
  }, [coop, doneSeq]);

  if (celebrate !== undefined && !coop) {
    return (
      <Shell title="Co-op task">
        <section
          role="status"
          data-testid="coop-done"
          className="flex flex-1 flex-col items-center justify-center gap-2 text-center"
        >
          <p className="font-display text-4xl font-bold text-accent">
            {celebrate > 0 ? `+${celebrate}` : '✓'}
          </p>
          <p className="text-lg">Co-op task complete</p>
        </section>
      </Shell>
    );
  }
  // Waiting for the partner shows on the task card (TaskPanel), over the live map.
  if (coop?.phase !== 'active') return null;
  // Keyed by task: a fresh session starts from an empty field.
  return <CoopSheet key={coop.taskId} view={view} />;
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="coop-sheet"
      className="fixed inset-0 z-[3000] flex flex-col bg-bg px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 overflow-y-auto">
        <header>
          <h2 className="font-display text-xl font-bold">{title}</h2>
        </header>
        {children}
      </div>
    </div>
  );
}

function CoopSheet({ view }: { view: PlayerView }) {
  const coop = view.game?.coop;
  const pushToast = useGame((s) => s.pushToast);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<'idle' | 'waiting'>('idle');
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), LOCKOUT_TICK_MS);
    return () => clearInterval(t);
  }, [lockedUntil]);

  if (!coop) return null;
  const digits = DEFAULT_CONFIG.coopPinDigits;
  const name = partnerName(view.game?.tasks ?? [], coop.taskId);
  const locked = now < lockedUntil;
  const lockLeft = Math.max(0, Math.ceil((lockedUntil - now) / MS_PER_S));

  const cancel = async () => {
    const res = await coopCancel(coop.taskId);
    if (!res.ok) pushToast(messageFor(res.code));
  };

  const submit = async () => {
    setBusy(true);
    const res = await coopSubmit(coop.taskId, pin);
    setBusy(false);
    if (!res.ok) {
      pushToast(messageFor(res.code));
      return;
    }
    if (res.data.result === 'wrong') {
      setPin('');
      setLockedUntil(Date.now() + DEFAULT_CONFIG.taskWrongLockoutS * MS_PER_S);
      setNow(Date.now());
    } else if (res.data.result === 'waiting') {
      setMine('waiting');
    }
  };

  return (
    <Shell title="Co-op task">
      {coop.phase === 'active' && coop.puzzle && (
        <section className="flex flex-1 flex-col gap-5" data-testid="coop-pin-panel">
          <div className="text-center">
            <p className="text-sm text-muted">Show this PIN to {name}</p>
            <output
              data-testid="coop-show"
              aria-label="Your PIN"
              className="mt-1 block font-mono text-6xl font-bold tracking-[0.2em] text-accent tabular-nums"
            >
              {coop.puzzle.show}
            </output>
          </div>
          <div className="flex flex-col gap-3">
            <label htmlFor="coop-pin-input" className="text-sm text-muted">
              Type the PIN {name} shows you
            </label>
            <input
              id="coop-pin-input"
              data-testid="coop-input"
              inputMode="numeric"
              pattern="[0-9]*"
              name="pin"
              spellCheck={false}
              autoComplete="off"
              maxLength={digits}
              value={pin}
              disabled={busy || locked || mine === 'waiting'}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, digits))}
              className="min-h-14 rounded-xl border border-white/15 bg-surface px-4 text-center font-mono text-3xl tracking-[0.3em] tabular-nums"
            />
            <Button
              data-testid="coop-submit"
              disabled={busy || locked || mine === 'waiting' || pin.length !== digits}
              onClick={() => void submit()}
            >
              {mine === 'waiting' ? `Waiting for ${name}…` : 'Submit'}
            </Button>
            {(locked || mine === 'waiting') && (
              <p
                role="status"
                data-testid="coop-feedback"
                className={`text-center font-semibold ${locked ? 'text-danger' : 'text-muted'}`}
              >
                {locked ? `Not quite. Try again in ${lockLeft} s.` : 'That PIN is right. Waiting…'}
              </p>
            )}
            {coop.botShows && (
              <p data-testid="coop-bot-hint" className="text-center text-xs text-muted">
                Test mode: your bot partner is showing {coop.botShows}
              </p>
            )}
          </div>
          <Button variant="ghost" data-testid="coop-cancel" onClick={() => void cancel()}>
            Step out
          </Button>
        </section>
      )}
    </Shell>
  );
}

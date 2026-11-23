/**
 * The minigame sheet (UI_UX §2): "Stop somewhere safe", then the game, then the
 * result. The server checks every answer. If the server drops the minigame (the
 * player walked away, lost GPS, left the zone) the sheet closes with a message.
 */
import {
  DEFAULT_CONFIG,
  type LockAction,
  type LockFeedback,
  type TaskAnswerBody,
  type TaskCard,
  type TaskOpenAck,
} from '@afterdark/shared';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { cancelTask, openTask, submitTask, taskAction } from '../../net/actions';
import { messageFor } from '../../net/errors';
import { useGame } from '../../store';
import { Button } from '../ui/Button';
import { Ghost } from './Ghost';
import { cardLabel } from './taskGeo';

// Each game loads only when a task of that type opens (ARCHITECTURE §11).
const Wires = lazy(() => import('../minigames/Wires'));
const LockBreaker = lazy(() => import('../minigames/LockBreaker'));

const MS_PER_S = 1000;
const RESULT_SHOWN_MS = 1400;
/** The fooled overlay can be dismissed after this long, so the joke is seen (UI_UX §3). */
const FOOLED_DISMISS_MS = 2000;
const LOCKOUT_TICK_MS = 250;

const GAME_NAMES = { wires: 'Wire Connect', lock: 'Lock Breaker' } as const;

type Step =
  | { kind: 'safe'; error?: string }
  | { kind: 'opening' }
  | { kind: 'play'; ack: TaskOpenAck }
  | { kind: 'done'; result: 'success' | 'fooled'; points: number };

export function TaskPlayer({ card, onClose: close }: { card: TaskCard; onClose: () => void }) {
  // The parent re-renders on every view, so its callback is new each time: keep the latest in a
  // ref and let effects call it without restarting (the close timer must run its whole length).
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  const onClose = useCallback(() => closeRef.current(), []);
  const [step, setStep] = useState<Step>({ kind: 'safe' });
  const [message, setMessage] = useState<string | undefined>();
  const [lockedUntil, setLockedUntil] = useState(0);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [shake, setShake] = useState(0);
  const resetSeq = useGame((s) => s.taskReset?.seq ?? 0);
  const startedAt = useRef(resetSeq);
  const live = useGame((s) => s.view?.game?.tasks?.some((t) => t.id === card.id) ?? false);

  // The server dropped the minigame (a `task.reset` event, already toasted): close.
  useEffect(() => {
    if (resetSeq !== startedAt.current && step.kind !== 'done') onClose();
  }, [resetSeq, step.kind, onClose]);

  // The card is gone from the view (swapped out): nothing left to play. While a submit is in
  // flight the card can vanish just before the ack arrives (it was completed): wait for the ack.
  useEffect(() => {
    if (!live && step.kind !== 'done' && !busy) onClose();
  }, [live, step.kind, busy, onClose]);

  // A completed task closes itself; the fooled overlay waits to be dismissed (after a short beat).
  const fooled = step.kind === 'done' && step.result === 'fooled';
  const [canDismiss, setCanDismiss] = useState(false);
  useEffect(() => {
    if (step.kind !== 'done') return;
    const t = setTimeout(
      fooled ? () => setCanDismiss(true) : onClose,
      fooled ? FOOLED_DISMISS_MS : RESULT_SHOWN_MS,
    );
    return () => clearTimeout(t);
  }, [step.kind, fooled, onClose]);

  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), LOCKOUT_TICK_MS);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const start = async () => {
    setStep({ kind: 'opening' });
    const res = await openTask(card.id);
    if (!res.ok) {
      setStep({ kind: 'safe', error: messageFor(res.code) });
      return;
    }
    setStep({ kind: 'play', ack: res.data });
  };

  const back = () => {
    if (step.kind === 'play') void cancelTask(card.id);
    onClose();
  };

  const submit = async (answer: TaskAnswerBody) => {
    setBusy(true);
    const res = await submitTask(card.id, answer);
    setBusy(false);
    if (!res.ok) {
      // The task was reset or removed under us, or we are locked out: say so and let the player retry or leave.
      setMessage(messageFor(res.code));
      if (res.code === 'NOT_ALLOWED' || res.code === 'NOT_FOUND') onClose();
      return;
    }
    if (res.data.result === 'wrong') {
      setMessage(undefined);
      setLockedUntil(Date.now() + DEFAULT_CONFIG.taskWrongLockoutS * MS_PER_S);
      setNow(Date.now());
      setShake((n) => n + 1);
      return;
    }
    setMessage(undefined);
    setStep({ kind: 'done', result: res.data.result, points: res.data.points });
  };

  const act = async (action: LockAction): Promise<LockFeedback | undefined> => {
    const res = await taskAction(card.id, action);
    if (!res.ok) {
      setMessage(messageFor(res.code));
      return undefined;
    }
    return res.data.feedback;
  };

  const locked = now < lockedUntil;
  const lockLeft = Math.max(0, Math.ceil((lockedUntil - now) / MS_PER_S));
  const disabled = busy || locked;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Task"
      data-testid="task-player"
      className="fixed inset-0 z-[3000] flex flex-col bg-bg px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 overflow-y-auto">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">
              {step.kind === 'play' ? GAME_NAMES[step.ack.type] : 'Task'}
            </h2>
            <p className="text-sm text-muted">{cardLabel(card)}</p>
          </div>
          {step.kind === 'play' && (
            <p className="font-mono text-sm text-accent" data-testid="task-points">
              +{step.ack.points}
            </p>
          )}
        </header>

        {(step.kind === 'safe' || step.kind === 'opening') && (
          <section className="flex flex-1 flex-col justify-center gap-4 text-center">
            <p className="font-display text-3xl font-bold" data-testid="safe-interstitial">
              Stop somewhere safe
            </p>
            <p className="text-muted">
              Look up first. Step away from traffic, then start. Walking away from the pin cancels
              the task.
            </p>
            {step.kind === 'safe' && step.error && (
              <p role="alert" className="font-semibold text-danger">
                {step.error}
              </p>
            )}
            <Button
              data-testid="task-safe-start"
              disabled={step.kind === 'opening'}
              onClick={() => void start()}
            >
              {step.kind === 'opening' ? 'Opening…' : 'I’m safe. Start'}
            </Button>
            <Button variant="ghost" data-testid="task-back" onClick={back}>
              Not now
            </Button>
          </section>
        )}

        {step.kind === 'play' && (
          <section key={shake} className={shake > 0 ? 'shake' : ''}>
            <Suspense fallback={<p className="text-center text-muted">Loading…</p>}>
              {step.ack.type === 'wires' && (
                <Wires
                  puzzle={step.ack.puzzle}
                  disabled={disabled}
                  onSubmit={(a) => void submit(a)}
                  onAction={() => Promise.resolve(undefined)}
                />
              )}
              {step.ack.type === 'lock' && (
                <LockBreaker
                  puzzle={step.ack.puzzle}
                  disabled={disabled}
                  onSubmit={(a) => void submit(a)}
                  onAction={act}
                />
              )}
            </Suspense>
            {(locked || message) && (
              <p
                role="status"
                data-testid="task-feedback"
                className="mt-3 text-center font-semibold text-danger"
              >
                {locked ? `Not quite. Try again in ${lockLeft} s.` : message}
              </p>
            )}
            <Button variant="ghost" className="mt-4 w-full" data-testid="task-back" onClick={back}>
              Back out
            </Button>
          </section>
        )}

        {step.kind === 'done' && (
          <section
            role="status"
            data-testid="task-done"
            className="flex flex-1 flex-col items-center justify-center gap-2 text-center"
          >
            {step.result === 'fooled' ? (
              <div data-testid="fooled-overlay" className="flex flex-col items-center gap-4">
                <Ghost className="h-40 w-36 text-muted" />
                <p className="font-display text-3xl font-bold">You got fooled by a fake task!</p>
                <p className="text-muted">It paid nothing. Someone out there is laughing.</p>
                <Button
                  data-testid="fooled-dismiss"
                  variant="secondary"
                  disabled={!canDismiss}
                  onClick={onClose}
                >
                  Dismiss
                </Button>
              </div>
            ) : (
              <>
                <p className="font-display text-4xl font-bold text-accent">+{step.points}</p>
                <p className="text-lg">Task complete</p>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

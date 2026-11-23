/**
 * The class-ability buttons (UI_UX §2): one per ability the imposter holds, with a
 * cooldown ring and the reason when it cannot be used. Task Stop asks first (it jams
 * every phone); Fake Task opens the placement mode on the map. The server decides.
 */
import type { AbilityId, PlayerView } from '@afterdark/shared';
import { useState } from 'react';

import { camouflage, taskStop } from '../../net/actions';
import { messageFor } from '../../net/errors';
import { useGame } from '../../store';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { abilityCooldownMs, abilityStateOf, type AbilityUiState } from './abilityState';
import { formatClock } from './format';
import { ProgressRing } from './ProgressRing';

const NAMES: Partial<Record<AbilityId, { label: string; short: string }>> = {
  taskStop: { label: 'Task Stop', short: 'STOP' },
  fakeTask: { label: 'Fake Task', short: 'FAKE' },
  camouflage: { label: 'Camouflage', short: 'CAMO' },
};

const REASON: Record<Exclude<AbilityUiState, 'ready' | 'cooldown'>, string> = {
  jammed: 'Already jammed',
  full: 'Two fakes out',
  oob: 'Return to the zone',
  gps: 'Waiting for GPS',
};

export function AbilityBar({
  view,
  now,
  onPlaceFake,
}: {
  view: PlayerView;
  now: number;
  onPlaceFake: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const pushToast = useGame((s) => s.pushToast);
  const abilities = (view.me.imposter?.abilities ?? []).filter((a) => NAMES[a.id]);
  if (abilities.length === 0) return null;

  const stop = async () => {
    setBusy(true);
    const res = await taskStop();
    setBusy(false);
    setConfirming(false);
    // The lock itself arrives as the next view and the public event; only a refusal needs a word.
    if (!res.ok) pushToast(res.message || messageFor(res.code));
  };

  // Your phone turns into a crew phone at once: the next view carries the disguise.
  const disguise = async () => {
    setBusy(true);
    const res = await camouflage();
    setBusy(false);
    if (!res.ok) pushToast(res.message || messageFor(res.code));
  };
  const use = (id: AbilityId) => {
    if (id === 'taskStop') setConfirming(true);
    else if (id === 'camouflage') void disguise();
    else onPlaceFake();
  };

  return (
    <div data-testid="ability-bar" className="flex items-start gap-4">
      {abilities.map((a) => {
        const name = NAMES[a.id];
        const state = abilityStateOf(view, a.id, now);
        const readyIn = Math.max(0, a.readyAt - now);
        const ring = state === 'cooldown' ? 1 - Math.min(1, readyIn / abilityCooldownMs(a.id)) : 1;
        const label =
          state === 'cooldown' ? formatClock(readyIn) : (name?.short ?? a.id.toUpperCase());
        return (
          <div key={a.id} className="flex flex-col items-center gap-1">
            <button
              type="button"
              data-testid={`ability-${a.id}`}
              data-state={state}
              disabled={state !== 'ready' || busy}
              onClick={() => use(a.id)}
              aria-label={
                state === 'ready'
                  ? `Use ${name?.label}`
                  : state === 'cooldown'
                    ? `${name?.label} ready in ${formatClock(readyIn)}`
                    : `${name?.label} unavailable: ${REASON[state]}`
              }
              className="touch-manipulation rounded-full transition active:scale-95 disabled:opacity-60"
            >
              <ProgressRing small fraction={ring}>
                <span className="font-mono text-xs font-bold tracking-wide">{label}</span>
              </ProgressRing>
            </button>
            <span className="max-w-20 text-center text-[0.7rem] leading-tight text-muted">
              {state === 'ready' || state === 'cooldown' ? name?.label : REASON[state]}
            </span>
          </div>
        );
      })}
      <Sheet open={confirming} title="Jam every task?" onClose={() => setConfirming(false)}>
        <p className="mb-4 text-muted">
          Every minigame in progress resets and nobody can open or submit a task for a short while.
          Everyone sees SYSTEMS JAMMED, but not who did it.
        </p>
        <div className="flex gap-3">
          <Button
            data-testid="taskstop-confirm"
            className="flex-1"
            disabled={busy}
            onClick={() => void stop()}
          >
            Task Stop
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

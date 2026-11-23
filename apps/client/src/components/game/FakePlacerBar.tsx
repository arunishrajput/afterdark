/**
 * Phantom placement mode (UI_UX §2): the map shows a crosshair at its centre, tinted
 * green or red from the client's own check of public data; the player pans the map to
 * aim and confirms. The server is authoritative (it also knows the task points), so a
 * refusal comes back as a toast and costs no cooldown.
 */
import type { LatLng, PlayerView } from '@afterdark/shared';
import { useState } from 'react';

import { placeFakeTask } from '../../net/actions';
import { messageFor } from '../../net/errors';
import { useGame } from '../../store';
import { Button } from '../ui/Button';
import { fakeSpotProblem } from './abilityState';

export function FakePlacerBar({
  view,
  center,
  onClose,
}: {
  view: PlayerView;
  /** The map's centre right now. */
  center: LatLng | undefined;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const pushToast = useGame((s) => s.pushToast);
  const problem = center ? fakeSpotProblem(view, center) : 'Move the map to aim';
  const confirm = async () => {
    if (!center) return;
    setBusy(true);
    const res = await placeFakeTask(center);
    setBusy(false);
    if (!res.ok) {
      pushToast(res.message || messageFor(res.code));
      return;
    }
    pushToast('Fake task planted. The next crew slot to refill gets it.');
    onClose();
  };
  return (
    <section
      aria-label="Place a fake task"
      data-testid="fake-placer"
      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-surface px-4 py-3"
    >
      <div>
        <p className="font-display text-lg font-bold">Place fake task</p>
        <p
          role="status"
          data-testid="fake-spot-status"
          data-valid={problem === undefined}
          className={`text-sm ${problem === undefined ? 'text-emerald-400' : 'text-danger'}`}
        >
          {problem === undefined
            ? 'Looks good. The server has the last word.'
            : `${problem}. Pan the map.`}
        </p>
      </div>
      <div className="flex gap-3">
        <Button
          data-testid="fake-confirm"
          className="flex-1"
          disabled={busy || problem !== undefined}
          onClick={() => void confirm()}
        >
          Plant it here
        </Button>
        <Button variant="secondary" data-testid="fake-cancel" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

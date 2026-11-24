/** The emergency-meeting button (MEETINGS §2): a confirm step, and how many meetings the player has left. */
import { useState } from 'react';

import { callMeeting } from '../../net/actions';
import { messageFor } from '../../net/errors';
import { useGame } from '../../store';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';

export function MeetingButton({ left, paused }: { left: number; paused: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pushToast = useGame((s) => s.pushToast);
  const call = async () => {
    setBusy(true);
    const res = await callMeeting();
    setBusy(false);
    setOpen(false);
    // The server decides (too early, cooldown, stale GPS); the meeting itself arrives as the next view.
    if (!res.ok) pushToast(res.message || messageFor(res.code));
  };
  return (
    <>
      <Button
        variant="secondary"
        data-testid="meeting-button"
        className="min-h-11 shrink-0 px-3 text-sm whitespace-nowrap"
        disabled={left === 0 || paused}
        onClick={() => setOpen(true)}
      >
        Meeting · {left} left
      </Button>
      <Sheet open={open} title="Call emergency meeting?" onClose={() => setOpen(false)}>
        <p className="mb-4 text-muted" data-testid="meeting-confirm-text">
          Everyone is called to the Base and the game clock stops. You have {left}.
        </p>
        <div className="flex gap-3">
          <Button
            data-testid="meeting-confirm"
            className="flex-1"
            disabled={busy}
            onClick={() => void call()}
          >
            Call meeting
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </>
  );
}

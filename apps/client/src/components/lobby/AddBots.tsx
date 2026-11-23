import { DEFAULT_CONFIG } from '@afterdark/shared';
import { useState } from 'react';

import { addBots } from '../../net/actions';
import { messageFor } from '../../net/errors';
import { useGame } from '../../store';
import { Button } from '../ui/Button';

/** Bots a demo needs: one human plus these makes a lobby of 8. */
const DEMO_BOTS = 7;

/** Test mode, host only: fill the lobby with in-process bots (TESTING §5). */
export function AddBots({ playerCount }: { playerCount: number }) {
  const [busy, setBusy] = useState(false);
  const pushToast = useGame((s) => s.pushToast);
  const room = DEFAULT_CONFIG.maxPlayers - playerCount;
  const count = Math.min(DEMO_BOTS, room);
  if (count < 1) return null;

  const onClick = async () => {
    setBusy(true);
    const res = await addBots(count);
    setBusy(false);
    if (!res.ok) pushToast(messageFor(res.code));
  };

  return (
    <section
      aria-label="Test bots"
      className="flex items-center justify-between gap-3 rounded-2xl border border-danger/30 p-3"
    >
      <p className="text-sm text-muted">Bots walk, ready up and play. Test mode only.</p>
      <Button
        data-testid="add-bots"
        variant="secondary"
        disabled={busy}
        className="shrink-0"
        onClick={() => void onClick()}
      >
        Add {count} {count === 1 ? 'bot' : 'bots'}
      </Button>
    </section>
  );
}

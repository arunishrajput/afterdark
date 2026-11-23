import { bearingDeg, distanceM, type PlayerView } from '@afterdark/shared';
import { useState } from 'react';

import { formatClock, formatDistance } from '../components/game/format';
import { GameMap } from '../components/game/GameMap';
import { GameMenu } from '../components/game/HostMenu';
import { Button } from '../components/ui/Button';
import { useSelfPosition } from '../hooks/useSelfPosition';
import { useServerNow } from '../hooks/useServerNow';
import { forceStart } from '../net/actions';
import { messageFor } from '../net/errors';
import { SimPanel } from '../sim/SimPanel';
import { useGame } from '../store';
import { useLocation } from '../store/location';

const REFRESH_MS = 500;

/** Where the spawn pin lies relative to the way the phone points (map-north up when there is no compass). */
function arrowDeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  heading?: number,
): number {
  return bearingDeg(from, to) - (heading ?? 0);
}

/**
 * Spawn phase (RULES §4, UI_UX §2): walk to your own pin. Nobody has a role yet,
 * and only your own spawn is ever sent to this device.
 */
export function Spawn({ view }: { view: PlayerView }) {
  const { me, game, lobby } = view;
  const now = useServerNow(REFRESH_MS);
  const self = useSelfPosition(view);
  const heading = useLocation((s) => s.fix?.heading);
  const simOn = useLocation((s) => s.sim.on);
  const simulated = lobby.testMode && simOn;
  const pushToast = useGame((s) => s.pushToast);
  const [busy, setBusy] = useState(false);
  const spawn = me.spawn;
  const progress = game?.spawn;

  const distance = self && spawn ? distanceM(self, spawn) : undefined;
  const timeLeft = progress ? formatClock(progress.endsAt - now) : undefined;

  const onForce = async () => {
    setBusy(true);
    const res = await forceStart();
    setBusy(false);
    if (!res.ok) pushToast(messageFor(res.code));
  };

  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.25em] text-muted uppercase">
            Lobby {lobby.code}
          </p>
          <h1 data-testid="spawn-title" className="font-display text-2xl font-bold">
            Walk to your spawn
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {lobby.testMode && (
            <span className="rounded-md border border-danger/50 px-2 py-0.5 font-mono text-xs font-semibold tracking-widest text-danger">
              TEST MODE
            </span>
          )}
          <GameMenu isHost={me.isHost} paused={false} canPause={false} />
        </div>
      </header>

      <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-surface p-3">
        <div
          aria-hidden="true"
          data-testid="spawn-arrow"
          className="grid size-14 shrink-0 place-items-center rounded-full border border-white/15 text-3xl transition-transform duration-200"
          style={{
            transform: self && spawn ? `rotate(${arrowDeg(self, spawn, heading)}deg)` : undefined,
          }}
        >
          ↑
        </div>
        <div className="min-w-0 flex-1">
          {me.spawn?.reached ? (
            <p data-testid="spawn-reached" className="font-display text-xl font-bold text-accent">
              You’re in position ✓
            </p>
          ) : (
            <p
              data-testid="spawn-distance"
              className="font-mono text-3xl font-semibold tabular-nums"
            >
              {distance === undefined ? '…' : formatDistance(distance)}
            </p>
          )}
          <p className="text-sm text-muted">
            {me.spawn?.reached
              ? 'Keep the screen on while the others arrive.'
              : 'to your pin. Walk, never run.'}
          </p>
        </div>
      </div>

      <div className="relative isolate min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10">
        <GameMap view={view} simulated={simulated} spawn={spawn} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p data-testid="spawn-count" className="font-mono text-lg font-semibold tabular-nums">
          {progress ? `${progress.reached}/${progress.total} in position` : '…'}
        </p>
        <p className="font-mono text-sm text-muted tabular-nums">{timeLeft} left</p>
      </div>

      {me.isHost && (
        <Button
          data-testid="force-start"
          variant="secondary"
          disabled={busy}
          onClick={() => void onForce()}
        >
          Force start
        </Button>
      )}
      <p className="text-center text-xs text-muted">
        Spawns are spread out on purpose, so nobody can read another screen.
      </p>
      {lobby.testMode && (
        <details className="rounded-xl border border-white/10 p-2">
          <summary className="min-h-11 cursor-pointer text-sm text-muted">GPS simulator</summary>
          <SimPanel />
        </details>
      )}
    </main>
  );
}

/** The imposter's "Infected: n" chip and the list of usernames by status (UI_UX §2, ROLES.md). */
import type { PlayerView } from '@afterdark/shared';
import { useState } from 'react';

import { useServerNow } from '../../hooks/useServerNow';
import { Sheet } from '../ui/Sheet';
import { formatClock } from './format';

const REFRESH_MS = 1000;

export function InfectedChip({ view }: { view: PlayerView }) {
  const imposter = view.me.imposter;
  const [open, setOpen] = useState(false);
  const now = useServerNow(REFRESH_MS, open);
  if (!imposter) return null;
  const nameOf = (id: string) => view.lobby.players.find((p) => p.id === id)?.username ?? 'Someone';
  const exposedIds = new Set(imposter.exposures.map((e) => e.playerId));
  const infected = imposter.compromisedIds.filter((id) => !exposedIds.has(id));
  const exposed = imposter.exposures;
  return (
    <>
      <button
        type="button"
        data-testid="infected-chip"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-full border border-infected/50 bg-infected/10 px-4 text-sm font-semibold text-infected"
      >
        Infected: {infected.length}
        {exposed.length > 0 && <span className="text-muted">+{exposed.length} incubating</span>}
      </button>
      <Sheet open={open} title="Infected players" onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-4" data-testid="infected-list">
          <section>
            <h3 className="mb-1 text-xs font-bold tracking-widest text-muted">
              INFECTED ({infected.length})
            </h3>
            {infected.length === 0 && <p className="text-sm text-muted">Nobody yet.</p>}
            <ul className="flex flex-col gap-1">
              {infected.map((id) => (
                <li key={id} className="font-semibold text-infected">
                  {nameOf(id)}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-1 text-xs font-bold tracking-widest text-muted">
              EXPOSED, INCUBATING ({exposed.length})
            </h3>
            {exposed.length === 0 && <p className="text-sm text-muted">Nobody right now.</p>}
            <ul className="flex flex-col gap-1">
              {exposed.map((e) => (
                <li key={e.playerId} className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{nameOf(e.playerId)}</span>
                  <span className="font-mono text-xs text-muted tabular-nums">
                    {e.incubationEndsAt === undefined
                      ? 'waiting for you to leave'
                      : `infected in ${formatClock(e.incubationEndsAt - now)}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <p className="text-xs text-muted">
            Only imposters see this. The players themselves are never told.
          </p>
        </div>
      </Sheet>
    </>
  );
}

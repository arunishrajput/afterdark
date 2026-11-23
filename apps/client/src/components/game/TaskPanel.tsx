/** The crew's task cards (UI_UX §2–§3): stage icon, "NE · Region A", distance and arrow, and the card menu. */
import type { PlayerView, TaskCard } from '@afterdark/shared';
import { useMemo, useState } from 'react';

import { useServerNow } from '../../hooks/useServerNow';
import { reportUnsafe, rerollTask } from '../../net/actions';
import { messageFor } from '../../net/errors';
import { useGame } from '../../store';
import type { SelfPosition } from '../map/MapView';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { formatClock, formatDistance } from './format';
import { cardLabel, guidance, sectionAnchor } from './taskGeo';

const CLOCK_REFRESH_MS = 1000;

const STAGE_ICON = { assigned: '🧭', pin: '📍', atPin: '🎯' } as const;
const STAGE_NAME = { assigned: 'Head to the area', pin: 'Walk to the pin', atPin: 'At the pin' };

function stageOf(card: TaskCard): keyof typeof STAGE_ICON {
  if (card.stage === 'assigned') return 'assigned';
  return card.atPin ? 'atPin' : 'pin';
}

export function TaskPanel({
  view,
  self,
  onFocus,
  onStart,
}: {
  view: PlayerView;
  self: SelfPosition | undefined;
  onFocus: (card: TaskCard) => void;
  onStart: (card: TaskCard) => void;
}) {
  const cards = view.game?.tasks ?? [];
  const [menuFor, setMenuFor] = useState<string | undefined>();
  const regions = view.lobby.map.regions;
  const pushToast = useGame((s) => s.pushToast);
  const rerollReadyAt = view.game?.rerollReadyAt;
  const now = useServerNow(CLOCK_REFRESH_MS, rerollReadyAt !== undefined);
  const rerollLeft = rerollReadyAt === undefined ? 0 : Math.max(0, rerollReadyAt - now);
  const menuCard = cards.find((c) => c.id === menuFor);

  // Cards change by id and stage; the regions only change in the lobby.
  const cardKey = cards.map((c) => `${c.id}:${c.stage}`).join('|');
  const targets = useMemo(() => {
    const out = new Map<string, { lat: number; lng: number } | undefined>();
    for (const c of cards) {
      if (c.stage === 'pin') out.set(c.id, { lat: c.lat, lng: c.lng });
      else {
        const region = regions.find((r) => r.id === c.regionId);
        out.set(c.id, region && sectionAnchor(region, c.section));
      }
    }
    return out;
    // `cards` itself is a new array on every view; `cardKey` says when it really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey, regions]);

  const act = async (run: () => ReturnType<typeof rerollTask>) => {
    const res = await run();
    if (!res.ok) pushToast(messageFor(res.code));
    else setMenuFor(undefined);
  };

  if (cards.length === 0) {
    return (
      <p className="rounded-2xl border border-white/10 bg-surface px-4 py-3 text-sm text-muted">
        Waiting for your next task…
      </p>
    );
  }

  return (
    <section aria-label="Your tasks" className="flex flex-col gap-2" data-testid="task-panel">
      {cards.map((card) => {
        const stage = stageOf(card);
        const target = targets.get(card.id);
        const g = self && target ? guidance(self, target, self.heading) : undefined;
        return (
          <article
            key={card.id}
            data-testid="task-card"
            data-stage={stage}
            className={`flex items-center gap-3 rounded-2xl border bg-surface px-3 py-2 ${stage === 'atPin' ? 'border-accent shadow-[0_0_14px_var(--accent-glow)]' : 'border-white/10'}`}
          >
            <button
              type="button"
              onClick={() => onFocus(card)}
              aria-label={`${STAGE_NAME[stage]}: ${cardLabel(card)}. Show on the map.`}
              className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span aria-hidden="true" className="text-2xl" data-testid="task-stage-icon">
                {STAGE_ICON[stage]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold" data-testid="task-label">
                  {cardLabel(card)}
                </span>
                <span className="block text-xs text-muted">{STAGE_NAME[stage]}</span>
              </span>
              {g && stage !== 'atPin' && (
                <span className="flex flex-col items-center text-xs text-muted tabular-nums">
                  <span
                    aria-hidden="true"
                    className="inline-block text-lg leading-none text-accent"
                    style={{ transform: `rotate(${g.arrowDeg}deg)` }}
                  >
                    ↑
                  </span>
                  <span data-testid="task-distance">{formatDistance(g.distanceM)}</span>
                </span>
              )}
            </button>
            {card.stage === 'pin' && card.atPin && (
              <Button
                data-testid="task-start"
                className="min-h-11 px-4"
                onClick={() => onStart(card)}
              >
                Start
              </Button>
            )}
            <Button
              variant="ghost"
              data-testid="task-menu"
              aria-label="Task options"
              className="min-h-11 min-w-11"
              onClick={() => setMenuFor(card.id)}
            >
              ⋯
            </Button>
          </article>
        );
      })}
      <Sheet
        open={menuCard !== undefined}
        title="Task options"
        onClose={() => setMenuFor(undefined)}
      >
        {menuCard && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">{cardLabel(menuCard)}</p>
            <Button
              variant="secondary"
              data-testid="task-reroll"
              disabled={rerollLeft > 0}
              onClick={() => void act(() => rerollTask(menuCard.id))}
            >
              {rerollLeft > 0 ? `Reroll ready in ${formatClock(rerollLeft)}` : 'Reroll this task'}
            </Button>
            {menuCard.stage === 'pin' && (
              <Button
                variant="danger"
                data-testid="task-report"
                onClick={() => void act(() => reportUnsafe(menuCard.id))}
              >
                Report this spot as unsafe
              </Button>
            )}
            <p className="text-xs text-muted">
              Reporting removes the spot for everyone for the rest of the game.
            </p>
          </div>
        )}
      </Sheet>
    </section>
  );
}

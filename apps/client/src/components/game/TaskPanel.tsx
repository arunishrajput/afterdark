/**
 * The task cards (UI_UX §2–§3): stage icon, "NE · Region A", distance and arrow, and the card menu.
 * Co-op cards say who to find and start or join the session at the pin. A disguised imposter's decoy
 * cards look and behave the same but never reach the server.
 */
import type { PlayerView, TaskCard } from '@afterdark/shared';
import { useMemo, useState } from 'react';

import { useServerNow } from '../../hooks/useServerNow';
import { coopJoin, coopStart, reportUnsafe, rerollTask } from '../../net/actions';
import { messageFor } from '../../net/errors';
import { useGame } from '../../store';
import type { SelfPosition } from '../map/MapView';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { formatClock, formatDistance } from './format';
import { priorityCardId } from './sheetState';
import { cardLabel, guidance, sectionAnchor } from './taskGeo';

const CLOCK_REFRESH_MS = 1000;

/** "Find GHOST-03 · NE · Region B" for a co-op card, "NE · Region B" otherwise (UI_UX §3). */
const labelOf = (card: TaskCard): string =>
  card.kind === 'coop' && card.partnerTag
    ? `Find ${card.partnerTag} · ${cardLabel(card)}`
    : cardLabel(card);

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
  cards: given,
  decoyIds,
  joinOffer,
  quiet = false,
  collapsed = false,
}: {
  view: PlayerView;
  self: SelfPosition | undefined;
  onFocus: (card: TaskCard) => void;
  onStart: (card: TaskCard) => void;
  /** The cards to show (default: the viewer's own). A disguised imposter passes decoys plus their real ones. */
  cards?: readonly TaskCard[] | undefined;
  /** Cards that are decoys: their menu is local and nothing reaches the server. */
  decoyIds?: ReadonlySet<string> | undefined;
  /** A disguised imposter beside a waiting crew member: the id to pass to `coop:join`. */
  joinOffer?: { taskId: string } | undefined;
  /** No "waiting for your next task" line when there is nothing to show (an imposter's panel). */
  quiet?: boolean;
  /** The game sheet is collapsed: only the most useful card (`priorityCardId`). */
  collapsed?: boolean;
}) {
  const cards = given ?? view.game?.tasks ?? [];
  const [menuFor, setMenuFor] = useState<string | undefined>();
  const regions = view.lobby.map.regions;
  const pushToast = useGame((s) => s.pushToast);
  const rerollReadyAt = view.game?.rerollReadyAt;
  // A Task Stop lock: nobody can open a task until it ends (RULES §7.2).
  const jammed = view.game?.taskLock !== undefined;
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
    // A decoy only pretends: the menu closes and nothing is sent (the card would be unknown to the server).
    if (menuCard && decoyIds?.has(menuCard.id)) {
      setMenuFor(undefined);
      return;
    }
    const res = await run();
    if (!res.ok) pushToast(messageFor(res.code));
    else setMenuFor(undefined);
  };

  /** Start or join the co-op session at the pin; the sheet that follows comes from the next view. */
  const coopAction = async (card: Extract<TaskCard, { stage: 'pin' }>) => {
    const res = await (card.partnerWaiting ? coopJoin(card.id) : coopStart(card.id));
    if (!res.ok) pushToast(messageFor(res.code));
  };
  const joinAsPartner = async () => {
    if (!joinOffer) return;
    const res = await coopJoin(joinOffer.taskId);
    if (!res.ok) pushToast(messageFor(res.code));
  };

  const guides = new Map(
    cards.map((c) => {
      const target = targets.get(c.id);
      return [c.id, self && target ? guidance(self, target, self.heading) : undefined] as const;
    }),
  );
  const shownId = collapsed
    ? priorityCardId(cards, {
        distances: new Map([...guides].map(([id, g]) => [id, g?.distanceM])),
      })
    : undefined;
  const shown = collapsed ? cards.filter((c) => c.id === shownId) : cards;

  if (cards.length === 0 && !joinOffer) {
    if (quiet) return null;
    return (
      <p className="rounded-2xl border border-white/10 bg-surface px-4 py-3 text-sm text-muted">
        Waiting for your next task…
      </p>
    );
  }

  return (
    <section aria-label="Your tasks" className="flex flex-col gap-2" data-testid="task-panel">
      {shown.map((card) => {
        const stage = stageOf(card);
        const g = guides.get(card.id);
        return (
          <article
            key={card.id}
            data-testid="task-card"
            data-stage={stage}
            data-kind={card.kind}
            data-requested={card.requested ? 'true' : undefined}
            data-holds-key={card.holdsKey ? 'true' : undefined}
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
                  {labelOf(card)}
                </span>
                <span className="block text-xs text-muted">
                  {card.kind === 'coop'
                    ? `${card.requested ? 'Requested by a teammate' : 'Co-op'} · ${STAGE_NAME[stage]}`
                    : card.holdsKey
                      ? `🔑 Key in hand · ${STAGE_NAME[stage]}`
                      : STAGE_NAME[stage]}
                </span>
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
            {card.stage === 'pin' && card.atPin && card.kind !== 'coop' && (
              <Button
                data-testid="task-start"
                className="min-h-11 px-4"
                disabled={jammed}
                onClick={() => onStart(card)}
              >
                {jammed ? 'Jammed' : 'Start'}
              </Button>
            )}
            {card.stage === 'pin' && card.atPin && card.kind === 'coop' && (
              <Button
                data-testid="coop-start"
                className="min-h-11 px-4"
                disabled={jammed}
                onClick={() => void coopAction(card)}
              >
                {jammed ? 'Jammed' : card.partnerWaiting ? 'Join' : 'Start co-op'}
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
      {joinOffer && (
        <article
          data-testid="coop-join-offer"
          className="flex items-center gap-3 rounded-2xl border border-accent bg-surface px-3 py-2 shadow-[0_0_14px_var(--accent-glow)]"
        >
          <span aria-hidden="true" className="text-2xl">
            🎯
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">Co-op task nearby</span>
            <span className="block text-xs text-muted">Someone is waiting for a partner</span>
          </span>
          <Button
            data-testid="coop-join-partner"
            className="min-h-11 px-4"
            disabled={jammed}
            onClick={() => void joinAsPartner()}
          >
            Join as partner
          </Button>
        </article>
      )}
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
              disabled={rerollLeft > 0 || menuCard.requested === true}
              onClick={() => void act(() => rerollTask(menuCard.id))}
            >
              {menuCard.requested
                ? 'A teammate asked for this one'
                : rerollLeft > 0
                  ? `Reroll ready in ${formatClock(rerollLeft)}`
                  : 'Reroll this task'}
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

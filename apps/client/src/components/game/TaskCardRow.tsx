/**
 * One task card (UI_UX §3): stage icon, the full label (it wraps, never cut off), direction and
 * distance, the card menu, and once at the pin an action row: Start, Start co-op / Join, or the
 * co-op wait with Cancel (ADR-104). Tapping the card centres the map on its target.
 */
import type { TaskCard } from '@afterdark/shared';

import { Button } from '../ui/Button';
import { formatDistance } from './format';
import { type Guidance, labelOf } from './taskGeo';

const STAGE_ICON = { assigned: '🧭', pin: '📍', atPin: '🎯' } as const;
const STAGE_NAME = { assigned: 'Head to the area', pin: 'Walk to the pin', atPin: 'At the pin' };
type CardStage = keyof typeof STAGE_ICON;

function stageOf(card: TaskCard): CardStage {
  if (card.stage === 'assigned') return 'assigned';
  return card.atPin ? 'atPin' : 'pin';
}

function subtitleOf(card: TaskCard, stage: CardStage): string {
  if (card.kind === 'coop')
    return `${card.requested ? 'Requested by a teammate' : 'Co-op'} · ${STAGE_NAME[stage]}`;
  if (card.holdsKey) return `🔑 Key in hand · ${STAGE_NAME[stage]}`;
  return STAGE_NAME[stage];
}

export function TaskCardRow({
  card,
  guide,
  jammed,
  waitingFor,
  onFocus,
  onStart,
  onCoop,
  onCancelCoop,
  onMenu,
}: {
  card: TaskCard;
  guide: Guidance | undefined;
  jammed: boolean;
  /** The viewer started this co-op and waits for this partner ("RAPTOR-04", or "your partner"). */
  waitingFor: string | undefined;
  onFocus: () => void;
  onStart: () => void;
  onCoop: () => void;
  onCancelCoop: () => void;
  onMenu: () => void;
}) {
  const stage = stageOf(card);
  const atPin = card.stage === 'pin' && card.atPin;
  const waiting = waitingFor !== undefined;
  return (
    <article
      data-testid="task-card"
      data-stage={stage}
      data-kind={card.kind}
      data-requested={card.requested ? 'true' : undefined}
      data-holds-key={card.holdsKey ? 'true' : undefined}
      data-waiting={waiting ? 'true' : undefined}
      className={`flex flex-col gap-2 rounded-2xl border bg-surface px-3 py-2 ${stage === 'atPin' ? 'border-accent shadow-[0_0_14px_var(--accent-glow)]' : 'border-white/10'}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onFocus}
          aria-label={`${STAGE_NAME[stage]}: ${labelOf(card)}. Show on the map.`}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span aria-hidden="true" className="text-2xl" data-testid="task-stage-icon">
            {STAGE_ICON[stage]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold break-words" data-testid="task-label">
              {labelOf(card)}
            </span>
            <span className="block text-xs text-muted">{subtitleOf(card, stage)}</span>
          </span>
          {guide && stage !== 'atPin' && (
            <span className="flex shrink-0 flex-col items-center text-xs text-muted tabular-nums">
              <span
                aria-hidden="true"
                className="inline-block text-lg leading-none text-accent"
                style={{ transform: `rotate(${guide.arrowDeg}deg)` }}
              >
                ↑
              </span>
              <span data-testid="task-distance">{formatDistance(guide.distanceM)}</span>
            </span>
          )}
        </button>
        <Button
          variant="ghost"
          data-testid="task-menu"
          aria-label="Task options"
          className="min-h-11 min-w-11 shrink-0"
          onClick={onMenu}
        >
          ⋯
        </Button>
      </div>

      {waiting ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p
              role="status"
              data-testid="coop-waiting"
              className="coop-wait min-w-0 flex-1 font-semibold break-words text-accent"
            >
              Waiting for {waitingFor}…
            </p>
            <Button
              variant="secondary"
              data-testid="coop-cancel"
              className="min-h-11 shrink-0 px-4"
              onClick={onCancelCoop}
            >
              Cancel
            </Button>
          </div>
          <p className="text-xs text-muted">
            Stay at the pin: {waitingFor === 'your partner' ? 'they' : waitingFor} must come here
            and tap Join. Stop somewhere safe while you wait.
          </p>
        </div>
      ) : (
        atPin && (
          <Button
            data-testid={card.kind === 'coop' ? 'coop-start' : 'task-start'}
            className="w-full"
            disabled={jammed}
            onClick={card.kind === 'coop' ? onCoop : onStart}
          >
            {jammed
              ? 'Jammed'
              : card.kind !== 'coop'
                ? 'Start'
                : card.partnerWaiting
                  ? 'Join'
                  : 'Start co-op'}
          </Button>
        )
      )}
    </article>
  );
}

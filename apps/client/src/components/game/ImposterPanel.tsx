/**
 * The imposter's ability bar (UI_UX §2): the Infect button with its channel and
 * cooldown rings, and the infected list chip. The button is disabled with its
 * reason when the client can already tell (cooldown, out of bounds, GPS, nobody in
 * range on the radar), and pulses when a target is in range. The server decides.
 */
import { DEFAULT_CONFIG, type PlayerView } from '@afterdark/shared';
import { useEffect, useRef } from 'react';

import { useServerNow } from '../../hooks/useServerNow';
import { cancelInfect, startInfect } from '../../net/actions';
import { buzz } from '../../net/cues';
import { messageFor } from '../../net/errors';
import { useGame } from '../../store';
import { Button } from '../ui/Button';
import { formatClock } from './format';
import { InfectedChip } from './InfectedList';
import { type InfectState, infectStateOf, targetOnRadar } from './infectState';
import { ProgressRing } from './ProgressRing';

const REFRESH_MS = 250;
const MS_PER_S = 1000;
const BUZZ_START_MS = [80];
const BUZZ_GAP_MS = [60, 40, 60, 40, 60];

const INFECT_ERRORS: Partial<Record<string, string>> = {
  OUT_OF_RANGE: 'No one is close enough.',
  COOLDOWN: 'Infect is recharging.',
  OUT_OF_BOUNDS: 'Get back inside the area first.',
};

const REASON: Record<Exclude<InfectState, 'channel' | 'ready' | 'cooldown'>, string> = {
  'no-target': 'No one in range',
  oob: 'Return to the zone',
  gps: 'Waiting for GPS',
};

export function ImposterPanel({ view }: { view: PlayerView }) {
  const imposter = view.me.imposter;
  const dots = useGame((s) => s.radar?.dots ?? []);
  const pushToast = useGame((s) => s.pushToast);
  const now = useServerNow(REFRESH_MS);
  const channel = imposter?.infect.channel;
  const hasTarget = targetOnRadar(view, dots);
  const state = imposter ? infectStateOf(view, now, hasTarget) : 'gps';

  // Haptics: a tick when the channel starts, a warning when the pair drifts apart.
  const inRange = channel?.inRange;
  const was = useRef<{ channel: boolean; inRange: boolean | undefined }>({
    channel: false,
    inRange: undefined,
  });
  useEffect(() => {
    const before = was.current;
    if (channel && !before.channel) buzz(BUZZ_START_MS);
    if (channel && before.inRange === true && inRange === false) buzz(BUZZ_GAP_MS);
    was.current = { channel: channel !== undefined, inRange };
  }, [channel, inRange]);

  if (!imposter) return null;
  const readyIn = Math.max(0, imposter.infect.readyAt - now);
  const cooldownTotalMs = DEFAULT_CONFIG.infectionCooldownS * MS_PER_S;
  const channelMs = view.lobby.config.infectionChannelS * MS_PER_S;
  const channelLeft = channel ? Math.max(0, channel.endsAt - now) : 0;

  const tap = async () => {
    const res = await startInfect();
    if (!res.ok) pushToast(INFECT_ERRORS[res.code] ?? messageFor(res.code));
  };

  let ring = 1;
  let label: string;
  if (state === 'channel') {
    ring = 1 - channelLeft / Math.max(1, channelMs);
    label = formatClock(channelLeft);
  } else if (state === 'cooldown') {
    ring = 1 - Math.min(1, readyIn / cooldownTotalMs);
    label = formatClock(readyIn);
  } else {
    label = 'INFECT';
  }

  return (
    <section
      aria-label="Imposter abilities"
      data-testid="imposter-panel"
      className="flex items-center gap-4 rounded-2xl border border-white/10 bg-surface px-4 py-3"
    >
      <button
        type="button"
        data-testid="infect-button"
        data-state={state}
        disabled={state !== 'ready' && state !== 'channel'}
        onClick={() => (state === 'channel' ? void cancelInfect() : void tap())}
        aria-label={
          state === 'channel'
            ? 'Cancel infecting'
            : state === 'ready'
              ? 'Infect the nearest player'
              : state === 'cooldown'
                ? `Infect ready in ${formatClock(readyIn)}`
                : `Infect unavailable: ${REASON[state]}`
        }
        className={`touch-manipulation rounded-full transition active:scale-95 disabled:opacity-60 ${
          state === 'ready' ? 'infect-pulse' : ''
        }`}
      >
        <ProgressRing fraction={ring} warn={state === 'channel' && channel?.inRange === false}>
          <span className="font-mono text-sm font-bold tracking-wide">{label}</span>
        </ProgressRing>
      </button>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <p data-testid="infect-hint" role="status" className="text-sm">
          {state === 'channel' &&
            (channel?.inRange ? (
              <span>Stay close…</span>
            ) : (
              <span className="font-semibold text-danger">Too far! Get back next to them.</span>
            ))}
          {state === 'ready' && <span>Target in range. Tap to infect.</span>}
          {state === 'cooldown' && <span className="text-muted">Recharging</span>}
          {state !== 'channel' && state !== 'ready' && state !== 'cooldown' && (
            <span className="text-muted">{REASON[state]}</span>
          )}
        </p>
        {state === 'channel' && (
          <Button
            variant="ghost"
            className="min-h-11 text-xs"
            data-testid="infect-cancel"
            onClick={() => void cancelInfect()}
          >
            Cancel (no cooldown)
          </Button>
        )}
        <InfectedChip view={view} />
      </div>
    </section>
  );
}

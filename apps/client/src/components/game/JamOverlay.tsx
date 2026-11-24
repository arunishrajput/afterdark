/**
 * "SYSTEMS JAMMED" (RULES §7.2, UI_UX §3): a Task Stop lock, shown to everyone with a
 * countdown. It says nothing about who did it. It does not block touches, so the menu
 * and the meeting button stay usable; the task buttons say why they are off.
 */
import { useServerNow } from '../../hooks/useServerNow';
import type { MapInsets } from '../map/insets';
import { formatClock } from './format';

const REFRESH_MS = 250;

/** `insets`: over a full-screen map, the words sit in the band the HUD and the sheet leave free. */
export function JamOverlay({ until, insets }: { until: number; insets?: MapInsets | undefined }) {
  const now = useServerNow(REFRESH_MS);
  return (
    <div
      role="alert"
      data-testid="jam-overlay"
      className="jam-overlay pointer-events-none absolute inset-0 z-[1000] grid place-items-center bg-bg/70 backdrop-blur-[2px]"
      style={insets && { paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <div className="text-center">
        <p className="jam-glitch font-display text-3xl font-bold tracking-widest">SYSTEMS JAMMED</p>
        <p className="mt-1 font-mono text-2xl tabular-nums" data-testid="jam-countdown">
          {formatClock(until - now)}
        </p>
        <p className="mt-1 text-sm text-muted">Tasks are locked. Minigames were reset.</p>
      </div>
    </div>
  );
}

/** HUD parts (UI_UX §3): match timer, infection boxes, team score bar, zone banner and edge glow. */
import type { PlayerView } from '@afterdark/shared';
import { useEffect, useRef, useState } from 'react';

import { useServerNow } from '../../hooks/useServerNow';
import { formatClock } from './format';

const TIMER_REFRESH_MS = 250;
const PERCENT = 100;
const SCORE_FLOAT_MS = 1300;
const GLITCH_MS = 900;

/** Remaining game time from the server's clock pair; frozen while `pausedAt` is set. */
export function MatchTimer({
  clock,
}: {
  clock: { endsAt: number; pausedAt?: number } | undefined;
}) {
  const now = useServerNow(TIMER_REFRESH_MS, clock?.pausedAt === undefined);
  if (!clock) return null;
  const remaining = clock.endsAt - (clock.pausedAt ?? now);
  return (
    <div className="flex flex-col items-center leading-none">
      <span data-testid="match-timer" className="font-mono text-2xl font-semibold tabular-nums">
        {formatClock(remaining)}
      </span>
      {clock.pausedAt !== undefined && (
        <span
          data-testid="paused-label"
          className="mt-1 font-mono text-[0.7rem] font-bold tracking-[0.25em] text-danger"
        >
          PAUSED
        </span>
      )}
    </div>
  );
}

/** `crewCount` squares: filled = compromised; a notch after box `threshold` marks the imposter win line. */
export function InfectionBoxes({
  crewCount,
  compromised,
  threshold,
}: {
  crewCount: number;
  compromised: number;
  threshold: number;
}) {
  // Boxes that filled since the last render glitch for a moment.
  const prev = useRef(compromised);
  const [glitch, setGlitch] = useState<{ from: number; to: number } | undefined>();
  useEffect(() => {
    const from = prev.current;
    prev.current = compromised;
    if (compromised <= from) return;
    setGlitch({ from, to: compromised });
    const t = setTimeout(() => setGlitch(undefined), GLITCH_MS);
    return () => clearTimeout(t);
  }, [compromised]);
  return (
    <div
      role="img"
      data-testid="infection-boxes"
      aria-label={`Infection: ${compromised} of ${crewCount} crew compromised. Imposters win at ${threshold}.`}
      className="flex items-center"
    >
      {Array.from({ length: crewCount }, (_, i) => (
        <span key={i} className="flex items-center">
          <span
            data-filled={i < compromised}
            className={`size-3.5 rounded-[3px] border border-white/30 bg-transparent transition-colors duration-150 data-[filled=true]:border-danger data-[filled=true]:bg-danger ${
              glitch !== undefined && i >= glitch.from && i < glitch.to ? 'box-glitch' : ''
            }`}
          />
          {i + 1 === threshold && (
            <span
              data-testid="infection-notch"
              aria-hidden="true"
              className="mx-1.5 h-6 w-[3px] rounded-full bg-text shadow-[0_0_8px_var(--accent-glow)]"
            />
          )}
          {i + 1 !== threshold && i + 1 < crewCount && <span className="w-1" />}
        </span>
      ))}
    </div>
  );
}

/** A "+N" that floats up from the score whenever the team score rises (UI_UX §3). */
function ScoreFloat({ score }: { score: number }) {
  const prev = useRef(score);
  const [float, setFloat] = useState<{ key: number; gain: number } | undefined>();
  useEffect(() => {
    const gain = score - prev.current;
    prev.current = score;
    if (gain <= 0) return;
    setFloat((f) => ({ key: (f?.key ?? 0) + 1, gain }));
    const t = setTimeout(() => setFloat(undefined), SCORE_FLOAT_MS);
    return () => clearTimeout(t);
  }, [score]);
  if (!float) return null;
  return (
    <span
      key={float.key}
      data-testid="score-float"
      aria-hidden="true"
      className="score-float absolute -top-1 right-0 font-mono text-sm font-bold text-accent"
    >
      +{float.gain}
    </span>
  );
}

export function TeamScoreBar({ score, target }: { score: number; target: number }) {
  const pct = Math.min(PERCENT, Math.round((score / Math.max(1, target)) * PERCENT));
  return (
    <div className="relative min-w-0 flex-1" data-testid="team-score">
      <ScoreFloat score={score} />
      <div
        role="progressbar"
        aria-label="Team score"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(score, target)}
        className="h-2.5 overflow-hidden rounded-full bg-white/10"
      >
        <div
          className="h-full rounded-full bg-accent shadow-[0_0_10px_var(--accent-glow)] transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 font-mono text-xs text-muted tabular-nums">
        {score} / {target}
      </p>
    </div>
  );
}

/** What is wrong with the player's position right now, most urgent first. */
export function StatusBanner({ view }: { view: PlayerView }) {
  const now = useServerNow(TIMER_REFRESH_MS, view.me.zone?.graceEndsAt !== undefined);
  const { zone, location } = view.me;
  let text: string | undefined;
  let detail: string | undefined;
  if (zone?.oob) {
    text = 'Return to the zone';
    if (zone.graceEndsAt !== undefined) {
      const left = Math.max(0, Math.ceil((zone.graceEndsAt - now) / 1000));
      detail = `Points start dropping in ${left} s`;
    } else {
      detail = 'You are losing points';
    }
  } else if (location?.quality === 'stale') {
    text = 'GPS signal lost';
    detail = 'Check that the screen stays on and location is allowed.';
  } else if (location?.quality === 'weak') {
    text = 'Weak GPS: move to open sky';
  }
  if (!text) return null;
  return (
    <div
      role="status"
      data-testid="status-banner"
      className="rounded-xl border border-danger/50 bg-danger/15 px-4 py-2 text-center"
    >
      <p className="font-semibold text-danger">{text}</p>
      {detail && <p className="text-xs text-text/80">{detail}</p>}
    </div>
  );
}

/** A red inner glow while out of bounds (never colour alone: the banner says it too). */
export function ZoneGlow({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="zone-glow"
      className="zone-glow pointer-events-none fixed inset-0 z-30"
    />
  );
}

import type { ImposterClass, PlayerView } from '@afterdark/shared';
import { useCallback, useState } from 'react';

import { formatClock } from '../components/game/format';
import { GameMenu } from '../components/game/HostMenu';
import { useServerNow } from '../hooks/useServerNow';

const REFRESH_MS = 250;

const CLASS_INFO: Record<ImposterClass, { name: string; blurb: string }> = {
  saboteur: { name: 'Saboteur', blurb: 'Task Stop: jam every task for a while.' },
  phantom: { name: 'Phantom', blurb: 'Fake Task: send crew to a worthless point.' },
  camouflage: { name: 'Camouflage', blurb: 'Look like crew on your own screen.' },
};

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V6L12 3Z" />
      <path d="m8.8 12.2 2.3 2.3 4.2-4.6" />
    </svg>
  );
}

function MaskIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="M4 5c3 1.6 13 1.6 16 0v6.5c0 4.4-3.4 8-8 8.5-4.6-.5-8-4.1-8-8.5V5Z" />
      <path d="M8 10.5c.9-.8 2.1-.8 3 0M13 10.5c.9-.8 2.1-.8 3 0M9 15.5c1.8 1.2 4.2 1.2 6 0" />
    </svg>
  );
}

/** The secret card. It is rendered only while it is held, so the role is never in the DOM otherwise. */
function RoleCard({ view }: { view: PlayerView }) {
  const { me } = view;
  const imposter = me.role === 'imposter';
  return (
    <div
      data-theme={imposter ? 'imposter' : 'crew'}
      data-testid="role-card"
      // pointer-events-none: the card covers the hold button, which must keep receiving the pointer.
      className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-bg px-6 text-center text-text"
      style={{
        backgroundImage: 'radial-gradient(120% 70% at 50% 0%, var(--accent-glow), transparent 65%)',
      }}
    >
      <div className="text-accent drop-shadow-[0_0_24px_var(--accent-glow)]">
        {imposter ? <MaskIcon /> : <ShieldIcon />}
      </div>
      <h2
        data-testid="role-name"
        className="font-display text-5xl font-bold tracking-wide text-accent"
      >
        {imposter ? 'IMPOSTER' : 'CREW'}
      </h2>
      <p className="max-w-xs text-text/80">
        {imposter
          ? 'Infect the crew without being caught. Never say this aloud.'
          : 'Finish tasks and find the imposters. Trust your eyes.'}
      </p>
      <div className="rounded-2xl border border-accent/40 bg-surface px-6 py-3">
        <p className="text-xs tracking-[0.3em] text-muted uppercase">Your tag</p>
        <p data-testid="role-tag" className="font-mono text-3xl font-bold tracking-wider">
          {me.tag}
        </p>
      </div>
      {imposter && me.imposter && (
        <div className="w-full max-w-sm space-y-3 text-left">
          <ul className="space-y-2">
            {me.imposter.classes.map((c) => (
              <li
                key={c}
                data-testid="class-card"
                className="rounded-xl border border-accent/40 bg-surface p-3"
              >
                <p className="font-display text-lg font-bold">{CLASS_INFO[c].name}</p>
                <p className="text-sm text-muted">{CLASS_INFO[c].blurb}</p>
              </li>
            ))}
          </ul>
          <div className="rounded-xl border border-white/10 bg-surface p-3">
            <p className="mb-2 text-xs tracking-[0.3em] text-muted uppercase">
              {me.imposter.allies.length === 0 ? 'You work alone' : 'Your allies'}
            </p>
            <ul className="space-y-1">
              {me.imposter.allies.map((a) => (
                <li
                  key={a.playerId}
                  data-testid="ally"
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="font-semibold">{a.username}</span>
                  <span className="font-mono text-sm">
                    {a.tag} · {a.classes.map((c) => CLASS_INFO[c].name).join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <p className="text-sm text-muted">Let go to hide it.</p>
    </div>
  );
}

/**
 * Role reveal (RULES §5.5, UI_UX §2): press and hold to read your role. The
 * screen stays neutral until you hold, so a glance over your shoulder shows nothing.
 */
export function RoleReveal({ view }: { view: PlayerView }) {
  const [held, setHeld] = useState(false);
  const now = useServerNow(REFRESH_MS);
  const endsAt = view.game?.revealEndsAt;
  const hold = useCallback(() => setHeld(true), []);
  const release = useCallback(() => setHeld(false), []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-3">
        <GameMenu isHost={view.me.isHost} paused={false} canPause={false} />
      </div>
      <p className="text-xs font-semibold tracking-[0.3em] text-muted uppercase">Roles are set</p>
      <button
        type="button"
        data-testid="reveal-hold"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          hold();
        }}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && hold()}
        onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && release()}
        onBlur={release}
        className="flex size-56 touch-none items-center justify-center rounded-full border-2 border-dashed border-white/30 bg-surface font-display text-xl font-bold select-none active:scale-[0.97]"
      >
        Press and hold to reveal
      </button>
      <p className="text-muted">
        Hide your screen from others. Play begins in{' '}
        <span data-testid="reveal-timer" className="font-mono text-text tabular-nums">
          {endsAt === undefined ? '…' : formatClock(endsAt - now)}
        </span>
        .
      </p>
      {held && <RoleCard view={view} />}
    </main>
  );
}

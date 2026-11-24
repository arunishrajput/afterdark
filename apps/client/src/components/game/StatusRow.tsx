/** The player's own line in the game sheet: role, tag, personal score and the meeting button. */
import type { PlayerView } from '@afterdark/shared';

import { MeetingButton } from './MeetingButton';

const CLASS_NAMES = { saboteur: 'Saboteur', phantom: 'Phantom', camouflage: 'Camouflage' } as const;

export function StatusRow({ view, disguised }: { view: PlayerView; disguised: boolean }) {
  const { me, game } = view;
  const imposter = me.imposter;
  const paused = game?.clock?.pausedAt !== undefined;
  const showImposter = imposter !== undefined && !disguised;
  return (
    <section
      aria-label="Your status"
      className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-bg/40 px-3 py-2"
    >
      <div className="min-w-0">
        <p
          data-testid="role-chip"
          className="font-display text-sm font-bold tracking-[0.2em] break-words text-accent"
        >
          {showImposter
            ? `IMPOSTER · ${imposter.classes
                .map((c) => CLASS_NAMES[c])
                .join(' + ')
                .toUpperCase()}`
            : 'CREW'}
        </p>
        <p className="flex flex-wrap gap-x-3 font-mono text-sm text-muted">
          <span data-testid="my-tag">Tag {me.tag}</span>
          <span data-testid="personal-score" className="tabular-nums">
            <span>You </span>
            <span className="text-text">{me.personalScore ?? 0}</span>
          </span>
        </p>
        {showImposter && imposter.allies.length > 0 && (
          <p data-testid="allies-chip" className="text-xs break-words text-muted">
            Allies: {imposter.allies.map((a) => `${a.username} (${a.tag})`).join(', ')}
          </p>
        )}
      </div>
      <MeetingButton left={game?.meetingsLeft ?? 0} paused={paused} />
    </section>
  );
}

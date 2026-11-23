import type { PlayerView, TaskCard } from '@afterdark/shared';
import { useState } from 'react';

import { GameMap } from '../components/game/GameMap';
import { GameMenu } from '../components/game/HostMenu';
import {
  InfectionBoxes,
  MatchTimer,
  StatusBanner,
  TeamScoreBar,
  ZoneGlow,
} from '../components/game/Hud';
import { ImposterPanel } from '../components/game/ImposterPanel';
import { TaskPanel } from '../components/game/TaskPanel';
import { TaskPlayer } from '../components/game/TaskPlayer';
import { useSelfPosition } from '../hooks/useSelfPosition';
import { SimPanel } from '../sim/SimPanel';
import { useLocation } from '../store/location';

const CLASS_NAMES = { saboteur: 'Saboteur', phantom: 'Phantom', camouflage: 'Camouflage' } as const;

/**
 * The game HUD (UI_UX §2–§3): timer, infection boxes, team score, the map, the
 * zone banner and edge glow, and the menu. Crew get task cards; imposters get the Infect bar.
 */
export function Game({ view }: { view: PlayerView }) {
  const { me, game, lobby } = view;
  const simOn = useLocation((s) => s.sim.on);
  const simulated = lobby.testMode && simOn;
  const imposter = me.imposter;
  const paused = game?.clock?.pausedAt !== undefined;
  const self = useSelfPosition(view);
  const cards = game?.tasks ?? [];
  // The card being played is kept here: the server drops a card from the view the moment it is
  // completed, and the sheet still has the result to show.
  const [playing, setPlaying] = useState<TaskCard | undefined>();
  const [focus, setFocus] = useState<{ id: string; seq: number } | undefined>();

  return (
    <main className="relative mx-auto flex h-dvh max-w-md flex-col gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <ZoneGlow active={me.zone?.oob === true} />
      <header className="flex items-center gap-3 rounded-2xl border border-white/10 bg-surface px-3 py-2">
        <MatchTimer clock={game?.clock} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {game?.crewCount !== undefined && game.threshold !== undefined && (
            <InfectionBoxes
              crewCount={game.crewCount}
              compromised={game.compromised ?? 0}
              threshold={game.threshold}
            />
          )}
          <TeamScoreBar score={game?.teamScore ?? 0} target={game?.targetScore ?? 1} />
        </div>
        <GameMenu isHost={me.isHost} paused={paused} canPause />
      </header>

      <StatusBanner view={view} />

      <div className="relative isolate min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10">
        <GameMap
          view={view}
          simulated={simulated}
          tasks={
            me.role === 'crew'
              ? { cards, regions: lobby.map.regions, focusId: focus?.id, focusSeq: focus?.seq }
              : undefined
          }
        />
        {paused && (
          <div
            role="status"
            data-testid="paused-overlay"
            className="absolute inset-0 z-[1000] grid place-items-center bg-bg/70 backdrop-blur-sm"
          >
            <p className="font-display text-3xl font-bold tracking-widest">PAUSED</p>
          </div>
        )}
      </div>

      {me.role === 'crew' && (
        <TaskPanel
          view={view}
          self={self}
          onFocus={(card: TaskCard) => setFocus((f) => ({ id: card.id, seq: (f?.seq ?? 0) + 1 }))}
          onStart={(card: TaskCard) => setPlaying(card)}
        />
      )}
      {me.role === 'imposter' && imposter && <ImposterPanel view={view} />}
      {playing && <TaskPlayer card={playing} onClose={() => setPlaying(undefined)} />}

      <section
        aria-label="Your status"
        className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-surface px-4 py-3"
      >
        <div>
          <p
            data-testid="role-chip"
            className="font-display text-sm font-bold tracking-[0.2em] text-accent"
          >
            {imposter
              ? `IMPOSTER · ${imposter.classes
                  .map((c) => CLASS_NAMES[c])
                  .join(' + ')
                  .toUpperCase()}`
              : 'CREW'}
          </p>
          <p className="font-mono text-sm text-muted">Tag {me.tag}</p>
          {imposter && imposter.allies.length > 0 && (
            <p data-testid="allies-chip" className="text-xs text-muted">
              Allies: {imposter.allies.map((a) => `${a.username} (${a.tag})`).join(', ')}
            </p>
          )}
        </div>
        <p className="text-right font-mono text-sm tabular-nums" data-testid="personal-score">
          <span className="text-muted">You </span>
          {me.personalScore ?? 0}
        </p>
      </section>

      {lobby.testMode && (
        <details className="rounded-xl border border-white/10 p-2">
          <summary className="min-h-11 cursor-pointer text-sm text-muted">GPS simulator</summary>
          <SimPanel />
        </details>
      )}
    </main>
  );
}

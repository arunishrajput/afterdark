import type { PlayerView } from '@afterdark/shared';

import { GameMap } from '../components/game/GameMap';
import { GameMenu } from '../components/game/HostMenu';
import { InfectionBoxes, MatchTimer, TeamScoreBar } from '../components/game/Hud';
import { useLocation } from '../store/location';

/**
 * An ejected player (ROLES.md › Spectator): the neutral theme, public information only:
 * the timer, the infection boxes, the team score and the map. No tasks, no abilities,
 * no votes. They can still watch the meetings.
 */
export function Spectator({ view }: { view: PlayerView }) {
  const { game, lobby, me } = view;
  const simOn = useLocation((s) => s.sim.on);
  const paused = game?.clock?.pausedAt !== undefined;
  return (
    <main
      data-testid="spectator-screen"
      className="relative mx-auto flex h-dvh max-w-md flex-col gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
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
      <section className="rounded-2xl border border-white/10 bg-surface px-4 py-3 text-center">
        <p data-testid="spectator-banner" className="font-display text-xl font-bold">
          You were ejected
        </p>
        <p className="text-sm text-muted">
          You can still watch. You see what everyone sees, nothing more. Keep quiet during meetings.
        </p>
      </section>
      <div className="relative isolate min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10">
        <GameMap view={view} simulated={lobby.testMode && simOn} tasks={undefined} />
      </div>
    </main>
  );
}

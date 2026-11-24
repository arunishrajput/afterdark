import type { PlayerView } from '@afterdark/shared';

import { GameMap } from '../components/game/GameMap';
import { GameSheet } from '../components/game/GameSheet';
import { HudBar } from '../components/game/Hud';
import { JamOverlay } from '../components/game/JamOverlay';
import { MapScreen } from '../components/game/MapScreen';
import { useLocation } from '../store/location';

/**
 * An ejected player (ROLES.md › Spectator): the neutral theme, public information only:
 * the timer, the infection boxes, the team score and the full-screen map. No tasks, no
 * abilities, no votes. They can still watch the meetings.
 */
export function Spectator({ view }: { view: PlayerView }) {
  const { game, lobby } = view;
  const simOn = useLocation((s) => s.sim.on);
  return (
    <MapScreen
      testId="spectator-screen"
      map={(insets) => (
        <>
          <GameMap
            view={view}
            simulated={lobby.testMode && simOn}
            tasks={undefined}
            insets={insets}
          />
          {game?.taskLock && <JamOverlay until={game.taskLock.until} insets={insets} />}
        </>
      )}
      top={<HudBar view={view} />}
      bottom={
        <GameSheet label="Spectating" expanded>
          <section className="px-1 pb-1 text-center">
            <p data-testid="spectator-banner" className="font-display text-xl font-bold">
              You were ejected
            </p>
            <p className="text-sm text-muted">
              You can still watch. You see what everyone sees, nothing more. Keep quiet during
              meetings.
            </p>
          </section>
        </GameSheet>
      }
    />
  );
}

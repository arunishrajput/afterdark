import type { FakeView, LatLng, PlayerView } from '@afterdark/shared';
import { lazy, Suspense } from 'react';

import { useSelfPosition } from '../../hooks/useSelfPosition';
import { simTeleport } from '../../net/actions';
import { useGame } from '../../store';
import type { SetupOverlay } from '../map/SetupLayers';
import type { TaskOverlay } from '../map/TaskLayers';

// Leaflet is heavy: fetched only once a lobby is open (same chunk as the lobby map).
const MapView = lazy(() => import('../map/MapView'));

/**
 * The in-game map: the playable area, regions with bucketed counts, no-go zones,
 * the Base, anonymous dots and the player's own marker. The task pool is never
 * drawn: the server doesn't send it after the lobby (ARCHITECTURE §4).
 */
export function GameMap({
  view,
  simulated,
  spawn,
  tasks,
  fakes,
  placing,
  resizeKey,
}: {
  view: PlayerView;
  simulated: boolean;
  /** Spawn phase: draw the player's own spawn pin. */
  spawn?: LatLng | undefined;
  /** Play: the viewer's own task layers. */
  tasks?: TaskOverlay | undefined;
  /** A Phantom's own fakes. */
  fakes?: readonly FakeView[] | undefined;
  /** A Phantom placing a fake task. */
  placing?: { onCenter: (at: LatLng) => void; valid: boolean } | undefined;
  resizeKey?: string;
}) {
  const radar = useGame((s) => s.radar);
  const self = useSelfPosition(view);
  const { map } = view.lobby;
  const overlay: SetupOverlay = {
    regions: map.regions,
    points: [],
    noGo: map.noGo,
    base: map.base,
    counts: view.game?.regionCounts ?? [],
  };
  return (
    <Suspense
      fallback={
        <div className="flex size-full items-center justify-center text-sm text-muted">
          Loading map…
        </div>
      }
    >
      <MapView
        ring={map.boundary?.ring}
        self={self}
        dots={radar?.dots ?? []}
        overlay={overlay}
        spawn={spawn}
        tasks={tasks}
        fakes={fakes}
        placing={placing}
        tool="none"
        onSimMove={simulated ? (to) => void simTeleport(to) : undefined}
        resizeKey={resizeKey}
      />
    </Suspense>
  );
}

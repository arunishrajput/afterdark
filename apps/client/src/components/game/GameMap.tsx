import type { LatLng, PlayerView } from '@afterdark/shared';
import { lazy, Suspense } from 'react';

import { useSelfPosition } from '../../hooks/useSelfPosition';
import { simTeleport } from '../../net/actions';
import { useGame } from '../../store';
import type { SetupOverlay } from '../map/SetupLayers';

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
  resizeKey,
}: {
  view: PlayerView;
  simulated: boolean;
  /** Spawn phase: draw the player's own spawn pin. */
  spawn?: LatLng | undefined;
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
        tool="none"
        onSimMove={simulated ? (to) => void simTeleport(to) : undefined}
        resizeKey={resizeKey}
      />
    </Suspense>
  );
}

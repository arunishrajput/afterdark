import type { BoundaryInput, LatLng, PlayerView } from '@afterdark/shared';
import { lazy, Suspense, useCallback, useState } from 'react';

import { devTeleport, setBoundary } from '../net/actions';
import { messageFor } from '../net/errors';
import { useGame } from '../store';
import { useLocation } from '../store/location';
import { Button } from './ui/Button';

// Leaflet and Geoman are heavy: only fetched once a lobby is open.
const MapView = lazy(() => import('./map/MapView'));

function MapFallback() {
  return (
    <div className="flex size-full items-center justify-center text-sm text-muted" aria-busy="true">
      Loading map…
    </div>
  );
}

/** The lobby map: preview card that expands to full screen; the host also gets the boundary tools. */
export function MapPanel({ view, simulated }: { view: PlayerView; simulated: boolean }) {
  const { lobby, me } = view;
  const [expanded, setExpanded] = useState(false);
  const radar = useGame((s) => s.radar);
  const fix = useLocation((s) => s.fix);
  const pushToast = useGame((s) => s.pushToast);

  // The device's own fix is smoother than the server's echo of it; fall back to the echo after a reload.
  const pos = fix ?? me.location;
  const self = pos
    ? {
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        ...(fix?.heading === undefined ? {} : { heading: fix.heading }),
        oob: me.location?.oob ?? false,
      }
    : undefined;

  const onBoundary = useCallback(
    async (boundary: BoundaryInput) => {
      const res = await setBoundary(boundary);
      if (!res.ok) pushToast(res.code === 'INVALID_PAYLOAD' ? res.message : messageFor(res.code));
    },
    [pushToast],
  );

  const onSimMove = useCallback(async (to: LatLng) => {
    useLocation.getState().patchSim({ ...to, placed: true });
    // Walking sends normal fixes; a teleport is a jump the speed check would reject, so use the test-mode hop.
    await devTeleport(to);
  }, []);

  const frame = expanded
    ? 'fixed inset-0 z-40 bg-bg'
    : // `isolate`: Leaflet's panes use z-index up to 1000 and must not paint over the Ready bar.
      'relative isolate h-72 overflow-hidden rounded-2xl border border-white/10';

  return (
    <section aria-labelledby="map-title" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 id="map-title" className="font-display text-lg font-bold">
          Map
        </h2>
        <span className="text-sm text-muted" data-testid="boundary-status">
          {lobby.map.boundary
            ? `Area ${Math.round(lobby.map.boundary.areaM2).toLocaleString('en-US')} m²`
            : me.isHost
              ? 'Draw the playable area'
              : 'Waiting for the host to draw the area'}
        </span>
      </div>
      <div className={frame} data-testid="map-frame">
        <Suspense fallback={<MapFallback />}>
          <MapView
            ring={lobby.map.boundary?.ring}
            self={self}
            dots={radar?.dots ?? []}
            onBoundary={me.isHost ? (b) => void onBoundary(b) : undefined}
            onSimMove={simulated ? (to) => void onSimMove(to) : undefined}
            resizeKey={expanded ? 'full' : 'card'}
          />
        </Suspense>
        <Button
          variant="secondary"
          data-testid="map-expand"
          aria-label={expanded ? 'Close the full-screen map' : 'Open the map full screen'}
          onClick={() => setExpanded((e) => !e)}
          className={`absolute z-[1000] min-h-11 px-3 text-sm ${expanded ? 'top-[max(0.5rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2' : 'right-2 bottom-2'}`}
        >
          {expanded ? 'Close map' : 'Expand'}
        </Button>
      </div>
      {me.location?.oob && (
        <p role="status" className="text-sm font-semibold text-danger">
          You are outside the playable area.
        </p>
      )}
    </section>
  );
}

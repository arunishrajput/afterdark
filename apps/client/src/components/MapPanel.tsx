import type { BoundaryInput, LatLng, PlayerView, Position } from '@afterdark/shared';
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';

import {
  devTeleport,
  editTaskPoints,
  regenerateRegions,
  renameRegion,
  setBase,
  setBoundary,
  setNoGoZones,
} from '../net/actions';
import { messageFor } from '../net/errors';
import { useGame } from '../store';
import { useLocation } from '../store/location';
import type { MapTool, SetupOverlay } from './map/SetupLayers';
import { SetupWizard, type StepId, type WizardActions } from './setup/SetupWizard';
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

const TOOL_OF_STEP: Partial<Record<StepId, MapTool>> = {
  points: 'points',
  base: 'base',
  nogo: 'nogo',
};

/**
 * The lobby map: a preview card that expands to full screen. Everyone sees the
 * boundary, regions (with counts), task points and the Base; the host also gets
 * the setup wizard and the editing tools for the current step.
 */
export function MapPanel({
  view,
  simulated,
  onOpenSettings,
}: {
  view: PlayerView;
  simulated: boolean;
  onOpenSettings: () => void;
}) {
  const { lobby, me } = view;
  const [expanded, setExpanded] = useState(false);
  const [step, setStep] = useState<StepId>('boundary');
  const [previewRegionId, setPreviewRegionId] = useState<string | undefined>();
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

  /** Shows the server's reason when it refuses a setup change. */
  const report = useCallback(
    (
      res: { ok: true } | { ok: false; code: Parameters<typeof messageFor>[0]; message: string },
    ) => {
      if (!res.ok) pushToast(res.code === 'INVALID_PAYLOAD' ? res.message : messageFor(res.code));
    },
    [pushToast],
  );

  const onBoundary = useCallback(
    async (boundary: BoundaryInput) => report(await setBoundary(boundary)),
    [report],
  );

  const onSimMove = useCallback(async (to: LatLng) => {
    useLocation.getState().patchSim({ ...to, placed: true });
    // Walking sends normal fixes; a teleport is a jump the speed check would reject, so use the test-mode hop.
    await devTeleport(to);
  }, []);

  const { map } = lobby;
  const actions: WizardActions = useMemo(
    () => ({
      setRegionCount: (count) => void regenerateRegions({ regionCount: count }).then(report),
      regenerateRegions: () => void regenerateRegions({}).then(report),
      renameRegion: (id, name) => void renameRegion(id, name).then(report),
      regeneratePoints: () => void editTaskPoints({ regenerate: true }).then(report),
      removeZone: (i) => void setNoGoZones(map.noGo.filter((_, j) => j !== i)).then(report),
      clearZones: () => void setNoGoZones([]).then(report),
      openSettings: onOpenSettings,
    }),
    [map.noGo, onOpenSettings, report],
  );

  const host = me.isHost;
  const tool: MapTool = host ? (TOOL_OF_STEP[step] ?? 'none') : 'none';
  const onMapTap = useCallback(
    (at: LatLng) => {
      if (step === 'points') void editTaskPoints({ add: [at] }).then(report);
      else if (step === 'base') void setBase(at).then(report);
    },
    [step, report],
  );
  const onNoGoZone = useCallback(
    (coords: Position[]) => void setNoGoZones([...map.noGo, coords]).then(report),
    [map.noGo, report],
  );

  const overlay: SetupOverlay = {
    regions: map.regions,
    points: map.taskPoints,
    noGo: map.noGo,
    base: map.base,
    counts: view.game?.regionCounts ?? [],
    previewRegionId: host && step === 'regions' ? previewRegionId : undefined,
  };

  const status = map.boundary
    ? `Area ${Math.round(map.boundary.areaM2).toLocaleString('en-US')} m² · ${map.regions.length} regions`
    : host
      ? 'Draw the playable area'
      : 'Waiting for the host to draw the area';

  const outer = expanded ? 'fixed inset-0 z-40 flex flex-col bg-bg' : 'flex flex-col gap-3';
  const frame = expanded
    ? 'relative isolate min-h-0 flex-1'
    : // `isolate`: Leaflet's panes use z-index up to 1000 and must not paint over the Ready bar.
      'relative isolate h-72 overflow-hidden rounded-2xl border border-white/10';

  return (
    <section aria-labelledby="map-title" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 id="map-title" className="font-display text-lg font-bold">
          Map
        </h2>
        <span className="text-sm text-muted" data-testid="boundary-status">
          {status}
        </span>
      </div>
      <div className={outer}>
        <div className={frame} data-testid="map-frame">
          <Suspense fallback={<MapFallback />}>
            <MapView
              ring={map.boundary?.ring}
              self={self}
              dots={radar?.dots ?? []}
              overlay={overlay}
              tool={tool}
              onBoundary={host && step === 'boundary' ? (b) => void onBoundary(b) : undefined}
              onNoGoZone={host && step === 'nogo' ? onNoGoZone : undefined}
              onMapTap={host && (step === 'points' || step === 'base') ? onMapTap : undefined}
              onPointTap={
                host && step === 'points'
                  ? (id) => void editTaskPoints({ remove: [id] }).then(report)
                  : undefined
              }
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
        {host && (
          <div
            className={
              expanded
                ? 'max-h-[45dvh] shrink-0 overflow-y-auto bg-bg p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]'
                : ''
            }
          >
            <SetupWizard
              view={view}
              step={step}
              onStep={setStep}
              previewRegionId={previewRegionId}
              onPreview={setPreviewRegionId}
              actions={actions}
            />
          </div>
        )}
      </div>
      {me.location?.oob && (
        <p role="status" className="text-sm font-semibold text-danger">
          You are outside the playable area.
        </p>
      )}
    </section>
  );
}

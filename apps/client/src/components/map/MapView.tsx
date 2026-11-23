/**
 * The lobby/game map (MAP_AND_REGIONS §7): CARTO Dark Matter tiles, the
 * boundary with the outside dimmed, your own marker with its accuracy circle,
 * and anonymous radar dots. Lazy-loaded so the Home screen stays light.
 */
import 'leaflet/dist/leaflet.css';

import type { AnonDot, BoundaryInput, FakeView, LatLng, Position } from '@afterdark/shared';
import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle,
  MapContainer,
  Marker,
  Polygon,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';

import { BoundaryEditor } from './BoundaryEditor';
import { CenterReporter, FakeMarkers } from './FakeLayers';
import { ringToLatLngs, toLeaflet, WORLD_RING } from './geo';
import { dotIcon, selfIcon, spawnIcon } from './icons';
import { NoGoEditor } from './NoGoEditor';
import { type MapTool, SetupLayers, type SetupOverlay } from './SetupLayers';
import { BOUNDARY_STYLE, OUTSIDE_STYLE, TILE_ATTRIBUTION, TILE_URL } from './style';
import { TaskLayers, type TaskOverlay } from './TaskLayers';

const FIT_PADDING: [number, number] = [28, 28];
const START_ZOOM = 17;
const WORLD_ZOOM = 2;
const MAX_ZOOM = 20;
const LONG_PRESS_MS = 650;
const LONG_PRESS_SLOP_PX = 10;

export interface SelfPosition extends LatLng {
  accuracy: number;
  heading?: number;
  oob: boolean;
}

export interface MapViewProps {
  ring: Position[] | undefined;
  self: SelfPosition | undefined;
  dots: readonly AnonDot[];
  /** Host only: show the drawing tools. */
  onBoundary?: ((boundary: BoundaryInput) => void) | undefined;
  /** Simulator only: long-press the map or drag your marker to move there. */
  onSimMove?: ((to: LatLng) => void) | undefined;
  /** Bumped by the parent when the map's box changed size (e.g. expanded). */
  resizeKey?: string | undefined;
  /** Regions, task points, no-go zones, Base and region counts (public setup data). */
  overlay?: SetupOverlay | undefined;
  /** What a tap does while the host edits the setup. */
  tool?: MapTool | undefined;
  /** Host: a tap on the bare map (add a task point, place the Base). */
  onMapTap?: ((at: LatLng) => void) | undefined;
  /** Host: a tap on a task point (delete it). */
  onPointTap?: ((id: string) => void) | undefined;
  /** Host: a finished no-go polygon. */
  onNoGoZone?: ((coords: Position[]) => void) | undefined;
  /** The player's own spawn point (spawn phase). */
  spawn?: LatLng | undefined;
  /** The player's own task cards: the section to head for and the revealed pins. */
  tasks?: TaskOverlay | undefined;
  /** A Phantom's own fake tasks (Phase 9). */
  fakes?: readonly FakeView[] | undefined;
  /** A Phantom placing a fake: a crosshair at the centre, tinted by `valid`, and the centre reported on every move. */
  placing?: { onCenter: (at: LatLng) => void; valid: boolean } | undefined;
}

/** Forwards taps on the bare map to the parent. */
function MapTaps({ onTap }: { onTap: (at: LatLng) => void }) {
  useMapEvents({ click: (e) => onTap({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

const spawnPin = spawnIcon();

function boundsOf(ring: Position[]): L.LatLngBounds {
  return L.latLngBounds(ring.map(([lng, lat]) => [lat, lng] as [number, number]));
}

/** Test hook: lets Playwright map lat/lng to pixels. Only when the page is in sim/dev mode. */
function exposeForTests(map: L.Map): void {
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('sim')) {
    (window as unknown as { __afterdarkMap?: L.Map }).__afterdarkMap = map;
  }
}

function MapEffects({
  ring,
  self,
  resizeKey,
  fitSignal,
  onSimMove,
}: Pick<MapViewProps, 'ring' | 'self' | 'resizeKey' | 'onSimMove'> & { fitSignal: number }) {
  const map = useMap();
  const fitted = useRef(false);
  const centred = useRef(false);
  // The parent re-renders on every fix; the long-press timer must outlive that.
  const simMove = useRef(onSimMove);
  const simEnabled = onSimMove !== undefined;
  useEffect(() => {
    simMove.current = onSimMove;
  }, [onSimMove]);

  useEffect(() => {
    exposeForTests(map);
  }, [map]);

  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 0);
    return () => clearTimeout(t);
  }, [map, resizeKey]);

  // The box can be laid out after Leaflet measured it (lazy chunk, flex-1 box, expand/collapse).
  // Re-measure on every resize, and keep the boundary fitted until the player moves the map themselves.
  const ringRef = useRef(ring);
  useEffect(() => {
    ringRef.current = ring;
  }, [ring]);
  useEffect(() => {
    const el = map.getContainer();
    let autoFit = true;
    const stopAutoFit = () => {
      autoFit = false;
    };
    el.addEventListener('pointerdown', stopAutoFit);
    el.addEventListener('wheel', stopAutoFit, { passive: true });
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      const r = ringRef.current;
      if (autoFit && r) map.fitBounds(boundsOf(r), { padding: FIT_PADDING, animate: false });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      el.removeEventListener('pointerdown', stopAutoFit);
      el.removeEventListener('wheel', stopAutoFit);
    };
  }, [map]);

  // Fit the first boundary we see; later changes only on the Fit button.
  useEffect(() => {
    if (!ring || fitted.current) return;
    fitted.current = true;
    // The container may have been laid out after Leaflet measured it (lazy chunk, full-height flex box).
    map.invalidateSize({ animate: false });
    map.fitBounds(boundsOf(ring), { padding: FIT_PADDING, animate: false });
  }, [map, ring]);

  useEffect(() => {
    if (fitSignal > 0 && ring) map.fitBounds(boundsOf(ring), { padding: FIT_PADDING });
    // Only the button (fitSignal) should trigger this, not every ring change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal, map]);

  // No boundary yet: centre once on the player.
  useEffect(() => {
    if (fitted.current || centred.current || !self) return;
    centred.current = true;
    map.setView(toLeaflet(self), START_ZOOM, { animate: false });
  }, [map, self]);

  // Simulator: long-press teleports.
  useEffect(() => {
    if (!simEnabled) return;
    const el = map.getContainer();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let start: { x: number; y: number } | undefined;
    const cancel = () => {
      clearTimeout(timer);
      start = undefined;
    };
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.leaflet-control, .leaflet-marker-icon')) return;
      start = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => {
        if (!start) return;
        const ll = map.mouseEventToLatLng(e);
        simMove.current?.({ lat: ll.lat, lng: ll.lng });
        start = undefined;
      }, LONG_PRESS_MS);
    };
    const move = (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > LONG_PRESS_SLOP_PX)
        cancel();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    return () => {
      cancel();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', cancel);
      el.removeEventListener('pointercancel', cancel);
    };
  }, [map, simEnabled]);

  return null;
}

function SelfLayer({
  self,
  onSimMove,
}: {
  self: SelfPosition;
  onSimMove: MapViewProps['onSimMove'];
}) {
  const icon = useMemo(
    () =>
      selfIcon({ oob: self.oob, ...(self.heading === undefined ? {} : { heading: self.heading }) }),
    [self.oob, self.heading],
  );
  return (
    <>
      <Circle
        center={toLeaflet(self)}
        radius={self.accuracy}
        pathOptions={{
          color: self.oob ? '#ff5a5a' : '#e6e8ee',
          weight: 1,
          opacity: 0.6,
          fillOpacity: 0.1,
          interactive: false,
        }}
      />
      <Marker
        position={toLeaflet(self)}
        icon={icon}
        zIndexOffset={1000}
        draggable={onSimMove !== undefined}
        keyboard={false}
        eventHandlers={
          onSimMove
            ? {
                dragend: (e) => {
                  const ll = (e.target as L.Marker).getLatLng();
                  onSimMove({ lat: ll.lat, lng: ll.lng });
                },
              }
            : {}
        }
      />
    </>
  );
}

export default function MapView({
  ring,
  self,
  dots,
  onBoundary,
  onSimMove,
  resizeKey,
  overlay,
  tool = 'none',
  onMapTap,
  onPointTap,
  onNoGoZone,
  spawn,
  tasks,
  fakes,
  placing,
}: MapViewProps) {
  const [fitSignal, setFitSignal] = useState(0);
  return (
    <div className="relative size-full" data-testid="map">
      {/* Hatching for no-go zones: Leaflet paths pick it up through the `nogo-zone` class. */}
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <defs>
          <pattern
            id="nogo-hatch"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="8" height="8" fill="rgb(255 90 90 / 0.12)" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgb(255 90 90 / 0.7)" strokeWidth="3" />
          </pattern>
        </defs>
      </svg>
      <MapContainer
        center={[0, 0]}
        zoom={WORLD_ZOOM}
        maxZoom={MAX_ZOOM}
        zoomControl={false}
        attributionControl
        // Geoman is opt-in (see BoundaryEditor): the map itself opts in so `map.pm` exists.
        pmIgnore={false}
        className="size-full"
      >
        <TileLayer
          url={TILE_URL}
          attribution={TILE_ATTRIBUTION}
          className="dark-tiles"
          maxZoom={MAX_ZOOM}
          maxNativeZoom={19}
        />
        {ring && (
          <>
            <Polygon positions={[WORLD_RING, ringToLatLngs(ring)]} pathOptions={OUTSIDE_STYLE} />
            {!onBoundary && (
              <Polygon
                positions={ringToLatLngs(ring)}
                pathOptions={BOUNDARY_STYLE}
                interactive={false}
              />
            )}
          </>
        )}
        {onBoundary && <BoundaryEditor ring={ring} onBoundary={onBoundary} />}
        {onNoGoZone && <NoGoEditor onZone={onNoGoZone} />}
        {overlay && <SetupLayers overlay={overlay} tool={tool} onPointTap={onPointTap} />}
        {onMapTap && <MapTaps onTap={onMapTap} />}
        {dots.map((d) => (
          <Marker
            key={d.alias}
            position={[d.lat, d.lng]}
            icon={dotIcon(d.flags)}
            interactive={false}
            keyboard={false}
          />
        ))}
        {spawn && (
          <Marker
            position={toLeaflet(spawn)}
            icon={spawnPin}
            zIndexOffset={900}
            interactive={false}
            keyboard={false}
          />
        )}
        {tasks && <TaskLayers overlay={tasks} />}
        {fakes && <FakeMarkers fakes={fakes} />}
        {placing && <CenterReporter onCenter={placing.onCenter} />}
        {self && <SelfLayer self={self} onSimMove={onSimMove} />}
        <MapEffects
          ring={ring}
          self={self}
          resizeKey={resizeKey}
          fitSignal={fitSignal}
          onSimMove={onSimMove}
        />
      </MapContainer>
      {placing && (
        <div
          data-testid="placer-cross"
          data-valid={placing.valid}
          className={`placer-cross ${placing.valid ? 'placer-cross--ok' : 'placer-cross--bad'}`}
        />
      )}
      {ring && (
        <button
          type="button"
          data-testid="map-fit"
          aria-label="Fit map to the playable area"
          onClick={() => setFitSignal((n) => n + 1)}
          className="absolute top-2 right-2 z-[1000] inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/20 bg-surface/90 px-3 text-sm font-semibold text-text backdrop-blur hover:border-white/40"
        >
          Fit
        </button>
      )}
    </div>
  );
}

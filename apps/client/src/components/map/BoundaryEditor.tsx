/**
 * The host's boundary tools (Leaflet-Geoman): draw a polygon, rectangle or
 * circle, or edit the current outline's corners. The server's ring is the single
 * source of truth: a drawing is turned into a `BoundaryInput`, sent, and the
 * outline that comes back in the next view is what stays on the map.
 */
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

import type { BoundaryInput, Position } from '@afterdark/shared';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

import { latLngsToCoords, ringToLatLngs, sameCorners } from './geo';
import { BOUNDARY_STYLE } from './style';

/** Wait this long after the last edit before sending, so one drag is one update. */
const EDIT_DEBOUNCE_MS = 500;

// Only layers that opt in (pmIgnore: false) get Geoman's edit handles.
L.PM.setOptIn(true);

export function BoundaryEditor({
  ring,
  onBoundary,
}: {
  ring: Position[] | undefined;
  onBoundary: (boundary: BoundaryInput) => void;
}) {
  const map = useMap();
  const send = useRef(onBoundary);
  const layerRef = useRef<L.Polygon | undefined>(undefined);
  /** The corners we last sent, so the echo from the server doesn't rebuild the layer mid-edit. */
  const lastSent = useRef<Position[] | undefined>(undefined);

  useEffect(() => {
    send.current = onBoundary;
  }, [onBoundary]);

  // Toolbar and draw events.
  useEffect(() => {
    map.pm.addControls({
      position: 'topleft',
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawText: false,
      drawRectangle: true,
      drawPolygon: true,
      drawCircle: true,
      editMode: true,
      dragMode: false,
      cutPolygon: false,
      removalMode: false,
      rotateMode: false,
    });
    map.pm.setGlobalOptions({
      allowSelfIntersection: false,
      pathOptions: { ...BOUNDARY_STYLE, pmIgnore: false },
      snappable: false,
    });

    const onCreate = (e: { shape: string; layer: L.Layer }) => {
      // The server's version replaces whatever was drawn.
      map.removeLayer(e.layer);
      if (e.layer instanceof L.Circle) {
        const c = e.layer.getLatLng();
        send.current({
          type: 'circle',
          center: { lat: c.lat, lng: c.lng },
          radiusM: e.layer.getRadius(),
        });
      } else if (e.layer instanceof L.Polygon) {
        const outer = e.layer.getLatLngs()[0] as L.LatLng[];
        const coords = latLngsToCoords(outer);
        lastSent.current = coords;
        send.current({ type: 'polygon', coords });
      }
    };
    map.on('pm:create', onCreate);
    return () => {
      map.off('pm:create', onCreate);
      map.pm.removeControls();
      if (map.pm.globalEditModeEnabled()) map.pm.disableGlobalEditMode();
      if (map.pm.globalDrawModeEnabled()) map.pm.disableDraw();
    };
  }, [map]);

  // The current outline, editable. Rebuilt when someone else (or a draw) changes it.
  useEffect(() => {
    if (!ring) return;
    if (layerRef.current && lastSent.current && sameCorners(ring, lastSent.current)) return;
    layerRef.current?.remove();
    const layer = L.polygon(ringToLatLngs(ring), { ...BOUNDARY_STYLE, pmIgnore: false }).addTo(map);
    layerRef.current = layer;
    let timer: ReturnType<typeof setTimeout> | undefined;
    layer.on('pm:edit', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const coords = latLngsToCoords(layer.getLatLngs()[0] as L.LatLng[]);
        lastSent.current = coords;
        send.current({ type: 'polygon', coords });
      }, EDIT_DEBOUNCE_MS);
    });
    layer.on('remove', () => clearTimeout(timer));
    if (map.pm.globalEditModeEnabled()) layer.pm.enable({ allowSelfIntersection: false });
  }, [map, ring]);

  useEffect(
    () => () => {
      layerRef.current?.remove();
      layerRef.current = undefined;
    },
    [],
  );

  return null;
}

/**
 * No-go zone drawing (Leaflet-Geoman, polygon only). Each finished polygon is
 * handed to the parent, which sends the full zone list to the server; the
 * server's zones (not the drawn layer) are what stay on the map.
 */
import '@geoman-io/leaflet-geoman-free';

import type { Position } from '@afterdark/shared';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

import { latLngsToCoords } from './geo';
import { NOGO_COLOR } from './style';

L.PM.setOptIn(true);

export function NoGoEditor({ onZone }: { onZone: (coords: Position[]) => void }) {
  const map = useMap();
  const send = useRef(onZone);
  useEffect(() => {
    send.current = onZone;
  }, [onZone]);

  useEffect(() => {
    map.pm.addControls({
      position: 'topleft',
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawText: false,
      drawRectangle: true,
      drawPolygon: true,
      drawCircle: false,
      editMode: false,
      dragMode: false,
      cutPolygon: false,
      removalMode: false,
      rotateMode: false,
    });
    map.pm.setGlobalOptions({
      allowSelfIntersection: false,
      pathOptions: { color: NOGO_COLOR, weight: 2, dashArray: '6 4', fillOpacity: 0.2 },
      snappable: false,
    });
    const onCreate = (e: { layer: L.Layer }) => {
      map.removeLayer(e.layer);
      if (e.layer instanceof L.Polygon) {
        send.current(latLngsToCoords(e.layer.getLatLngs()[0] as L.LatLng[]));
      }
    };
    map.on('pm:create', onCreate);
    return () => {
      map.off('pm:create', onCreate);
      map.pm.removeControls();
      if (map.pm.globalDrawModeEnabled()) map.pm.disableDraw();
    };
  }, [map]);

  return null;
}

/**
 * The Phantom's own fake tasks on the map (MAP §7) and the centre reporter for the
 * placement mode. Only the Phantom's view carries fakes; nobody else ever draws one.
 */
import type { FakeView, LatLng } from '@afterdark/shared';
import { useContext, useEffect } from 'react';
import { Marker, useMap, useMapEvents } from 'react-leaflet';

import { fakePinIcon } from './icons';
import { MapInsetsContext } from './insets';

const icons = { queued: fakePinIcon(false), assigned: fakePinIcon(true) };

export function FakeMarkers({ fakes }: { fakes: readonly FakeView[] }) {
  return (
    <>
      {fakes.map((f) => (
        <Marker
          key={`${f.id}:${f.assigned}`}
          position={[f.lat, f.lng]}
          icon={f.assigned ? icons.assigned : icons.queued}
          interactive={false}
          keyboard={false}
          zIndexOffset={650}
        />
      ))}
    </>
  );
}

/**
 * Tells the parent where the crosshair is, now and whenever the player pans or zooms: the middle
 * of the band the HUD and the sheet leave uncovered (the map's own centre when nothing covers it).
 */
export function CenterReporter({ onCenter }: { onCenter: (at: LatLng) => void }) {
  const map = useMap();
  const insets = useContext(MapInsetsContext);
  const report = () => {
    const size = map.getSize();
    const c = map.containerPointToLatLng([size.x / 2, (insets.top + size.y - insets.bottom) / 2]);
    onCenter({ lat: c.lat, lng: c.lng });
  };
  useMapEvents({ move: report, zoomend: report });
  // Again when the overlays change height: the crosshair moved with them.
  useEffect(report, [insets]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * The Phantom's own fake tasks on the map (MAP §7) and the centre reporter for the
 * placement mode. Only the Phantom's view carries fakes; nobody else ever draws one.
 */
import type { FakeView, LatLng } from '@afterdark/shared';
import { useEffect } from 'react';
import { Marker, useMap, useMapEvents } from 'react-leaflet';

import { fakePinIcon } from './icons';

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

/** Tells the parent where the map's centre is, now and whenever the player pans or zooms. */
export function CenterReporter({ onCenter }: { onCenter: (at: LatLng) => void }) {
  const map = useMap();
  const report = () => {
    const c = map.getCenter();
    onCenter({ lat: c.lat, lng: c.lng });
  };
  useMapEvents({ move: report, zoomend: report });
  useEffect(report, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

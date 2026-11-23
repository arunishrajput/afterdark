/**
 * Real GPS: one `watchPosition` for the tab (ARCHITECTURE §5). A module-level
 * singleton so the "Allow location" button (a user gesture) can start it.
 */
import { useLocation } from '../store/location';

const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 };

const GEO_PERMISSION_DENIED = 1;
const GEO_TIMEOUT = 3;

let watchId: number | undefined;

export function geolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/** Starts watching (a first call may show the browser's permission prompt). Idempotent. */
export function startWatch(): void {
  const loc = useLocation.getState();
  if (!geolocationSupported()) {
    loc.setPermission('unsupported');
    return;
  }
  if (watchId !== undefined) return;
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const s = useLocation.getState();
      s.setPermission('granted');
      s.setGeoError(undefined);
      const { latitude, longitude, accuracy, heading, speed } = pos.coords;
      s.setFix({
        lat: latitude,
        lng: longitude,
        accuracy,
        ...(heading !== null && Number.isFinite(heading) ? { heading } : {}),
        ...(speed !== null && Number.isFinite(speed) ? { speed } : {}),
        ts: pos.timestamp,
        receivedAt: Date.now(),
        source: 'gps',
      });
    },
    (err) => {
      const s = useLocation.getState();
      if (err.code === GEO_PERMISSION_DENIED) {
        s.setPermission('denied');
        stopWatch();
      } else {
        s.setGeoError(err.code === GEO_TIMEOUT ? 'timeout' : 'unavailable');
      }
    },
    GEO_OPTIONS,
  );
}

export function stopWatch(): void {
  if (watchId === undefined) return;
  navigator.geolocation.clearWatch(watchId);
  watchId = undefined;
}

/** Reads the permission state where the Permissions API supports geolocation. */
export async function probePermission(
  onChange: (state: PermissionState) => void,
): Promise<() => void> {
  if (!geolocationSupported()) {
    useLocation.getState().setPermission('unsupported');
    return () => undefined;
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    const apply = () => onChange(status.state);
    apply();
    status.addEventListener('change', apply);
    return () => status.removeEventListener('change', apply);
  } catch {
    // Older Safari has no geolocation permission query: show the "Allow" button.
    useLocation.getState().setPermission('prompt');
    return () => undefined;
  }
}

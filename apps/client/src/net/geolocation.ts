/**
 * Real GPS: one `watchPosition` for the tab (ARCHITECTURE §5). A module-level
 * singleton so the "Allow location" button (a user gesture) can start it.
 */
import { useLocation } from '../store/location';

const GEO_TIMEOUT_MS = 10_000;
const geoOptions = (enableHighAccuracy: boolean): PositionOptions => ({
  enableHighAccuracy,
  maximumAge: 0,
  timeout: GEO_TIMEOUT_MS,
});

/**
 * Full GPS is the battery's biggest cost, so a player who is ready in the
 * lobby (and waiting for others, no countdown running) drops to the coarse
 * network location. Everything else needs the real thing (ADR-100).
 */
export function wantsHighAccuracy(
  phase: string | undefined,
  ready: boolean,
  countdownRunning: boolean,
): boolean {
  return !(phase === 'lobby' && ready && !countdownRunning);
}

const GEO_PERMISSION_DENIED = 1;
const GEO_TIMEOUT = 3;

let watchId: number | undefined;
let watchHigh = true;
/** The mode the next (re)start will use; the lobby flips it (see `wantsHighAccuracy`). */
let wantHigh = true;

export function geolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/** Switches between full GPS and the coarse location; a running watch restarts in the new mode. */
export function setHighAccuracy(high: boolean): void {
  wantHigh = high;
  if (watchId !== undefined && watchHigh !== high) startWatch();
}

/** Starts watching (a first call may show the browser's permission prompt). Idempotent. */
export function startWatch(): void {
  const loc = useLocation.getState();
  if (!geolocationSupported()) {
    loc.setPermission('unsupported');
    return;
  }
  if (watchId !== undefined) {
    if (watchHigh === wantHigh) return;
    stopWatch();
  }
  watchHigh = wantHigh;
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
    geoOptions(watchHigh),
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

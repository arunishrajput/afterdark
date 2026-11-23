/** Local location state: the device's own fix, permission, wake lock and the GPS simulator. */
import { DEFAULT_CONFIG, type LatLng } from '@afterdark/shared';
import { create } from 'zustand';

import { type Keys, NO_KEYS } from '../sim/walk';

export type Permission = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';
export type GeoError = 'unavailable' | 'timeout';
export type WakeLockState = 'idle' | 'held' | 'unsupported';

/** A raw fix from the device (or the simulator). `ts` is the device clock. */
export interface LocalFix extends LatLng {
  accuracy: number;
  heading?: number;
  speed?: number;
  ts: number;
  /** `Date.now()` when we received it (device clock): its age is what we check. */
  receivedAt: number;
  source: 'gps' | 'sim';
}

export const SIM_ACCURACY_MIN_M = 5;
export const SIM_ACCURACY_MAX_M = 50;
/** Where the simulator starts when nothing else says (the demo area). */
export const SIM_DEFAULT_START: LatLng = { lat: 28.6139, lng: 77.209 };

export interface SimState extends LatLng {
  /** The player chose simulated GPS (only takes effect while the lobby is in test mode). */
  on: boolean;
  /** Has the position been placed yet (URL, boundary centre or a teleport)? */
  placed: boolean;
  accuracy: number;
  /** Stop sending fixes, to test the "signal lost" path. */
  stale: boolean;
  keys: Keys;
}

interface LocationState {
  permission: Permission;
  geoError: GeoError | undefined;
  fix: LocalFix | undefined;
  wakeLock: WakeLockState;
  sim: SimState;
  setPermission: (p: Permission) => void;
  setGeoError: (e: GeoError | undefined) => void;
  setFix: (fix: LocalFix | undefined) => void;
  setWakeLock: (w: WakeLockState) => void;
  patchSim: (patch: Partial<SimState>) => void;
}

export const useLocation = create<LocationState>()((set) => ({
  permission: 'unknown',
  geoError: undefined,
  fix: undefined,
  wakeLock: 'idle',
  sim: {
    ...SIM_DEFAULT_START,
    on: false,
    placed: false,
    accuracy: SIM_ACCURACY_MIN_M,
    stale: false,
    keys: NO_KEYS,
  },
  setPermission: (permission) => set({ permission }),
  setGeoError: (geoError) => set({ geoError }),
  setFix: (fix) => set({ fix }),
  setWakeLock: (wakeLock) => set({ wakeLock }),
  patchSim: (patch) => set((s) => ({ sim: { ...s.sim, ...patch } })),
}));

/** Settings the sender reads from the shared config (all 🔒 constants). */
export const SEND_GATE = {
  sendIntervalMs: DEFAULT_CONFIG.locationSendIntervalMs,
  minMoveM: DEFAULT_CONFIG.locationMinMoveM,
  heartbeatMs: DEFAULT_CONFIG.stationarySendIntervalMs,
} as const;

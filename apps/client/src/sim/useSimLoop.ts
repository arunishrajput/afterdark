import { useEffect } from 'react';

import { useLocation } from '../store/location';
import { stepSim } from './walk';

const SIM_TICK_MS = 250;
const MS_PER_S = 1000;

/**
 * While simulated GPS is the source: walk by the held keys and publish a fix
 * four times a second, exactly where the real watchPosition would. The send
 * path (throttle, heartbeat, `loc:update`) is shared with real GPS.
 */
export function useSimLoop(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const dtS = (now - last) / MS_PER_S;
      last = now;
      const { sim, patchSim, setFix } = useLocation.getState();
      const next = stepSim(sim, sim.keys, dtS);
      if (next !== sim) patchSim({ lat: next.lat, lng: next.lng });
      if (sim.stale) return; // "signal lost": stop producing fixes
      setFix({
        lat: next.lat,
        lng: next.lng,
        accuracy: sim.accuracy,
        ts: now,
        receivedAt: now,
        source: 'sim',
      });
    }, SIM_TICK_MS);
    return () => clearInterval(timer);
  }, [active]);
}

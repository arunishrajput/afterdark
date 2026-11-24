import { DEFAULT_CONFIG } from '@afterdark/shared';
import { useEffect } from 'react';

import { useWakeLock } from '../hooks/useWakeLock';
import {
  probePermission,
  setHighAccuracy,
  startWatch,
  stopWatch,
  wantsHighAccuracy,
} from '../net/geolocation';
import { type LastSend, MotionTracker, shouldSend } from '../net/locationGate';
import { socket } from '../net/socket';
import { useSimLoop } from '../sim/useSimLoop';
import { useConnection, useGame } from '../store';
import { SEND_GATE, useLocation } from '../store/location';

const MS_PER_S = 1000;

/** Mean of the ring's vertices (the closing point repeats the first, so skip it). */
function ringCentre(ring: readonly (readonly [number, number])[]): { lat: number; lng: number } {
  const pts = ring.slice(0, -1);
  const n = Math.max(pts.length, 1);
  return {
    lng: pts.reduce((a, p) => a + p[0], 0) / n,
    lat: pts.reduce((a, p) => a + p[1], 0) / n,
  };
}
const HEARTBEAT_CHECK_MS = 1000;

/**
 * Headless: lives while the player is in a lobby or game. Runs the location
 * source (real GPS or the simulator), sends fixes to the server and holds the
 * screen awake. Renders nothing.
 */
export function LocationProvider({ simulated }: { simulated: boolean }) {
  useWakeLock(true);
  useSimLoop(simulated);

  // Battery: a ready player waiting in the lobby doesn't need full GPS.
  const high = useGame((s) =>
    wantsHighAccuracy(
      s.view?.lobby.phase,
      s.view?.me.ready === true,
      s.view?.lobby.countdownEndsAt !== undefined,
    ),
  );
  useEffect(() => {
    setHighAccuracy(high);
  }, [high]);

  // Real GPS: only while the simulator isn't the source.
  useEffect(() => {
    if (simulated) {
      stopWatch();
      return;
    }
    let stopProbe: (() => void) | undefined;
    let gone = false;
    void probePermission((state) => {
      const loc = useLocation.getState();
      loc.setPermission(state);
      if (state === 'granted') startWatch();
    }).then((stop) => {
      if (gone) stop();
      else stopProbe = stop;
    });
    return () => {
      gone = true;
      stopProbe?.();
      stopWatch();
    };
  }, [simulated]);

  // First time the simulator is the source: start in the middle of the boundary, if there is one.
  useEffect(() => {
    if (!simulated) return;
    const { sim, patchSim } = useLocation.getState();
    if (sim.placed) return;
    const ring = useGame.getState().view?.lobby.map.boundary?.ring;
    const centre = ring ? ringCentre(ring) : undefined;
    patchSim({ ...(centre ?? {}), placed: true });
  }, [simulated]);

  // Switching source drops the old source's fix, so it can't be sent as the new one's.
  useEffect(() => {
    useLocation.getState().setFix(undefined);
  }, [simulated]);

  // Sender: on every new fix, plus a 1 s check so a still player's heartbeat goes out.
  useEffect(() => {
    let last: LastSend | undefined;
    const motion = new MotionTracker(SEND_GATE);
    const send = () => {
      const { fix, sim } = useLocation.getState();
      if (!fix || !socket.connected) return;
      if (fix.source === 'sim' && sim.stale) return;
      const now = Date.now();
      // A fix older than staleAfterS means the GPS went quiet: don't pretend it's live.
      if (now - fix.receivedAt > DEFAULT_CONFIG.staleAfterS * MS_PER_S) return;
      if (!shouldSend(last, now, motion.isStationary(now), SEND_GATE)) return;
      last = { lat: fix.lat, lng: fix.lng, at: now };
      const { offsetMs } = useConnection.getState();
      socket.volatile.emit('loc:update', {
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        ts: fix.ts + offsetMs,
        ...(fix.heading === undefined ? {} : { heading: fix.heading }),
        ...(fix.speed === undefined ? {} : { speed: fix.speed }),
      });
    };
    const unsub = useLocation.subscribe((s, prev) => {
      if (s.fix === prev.fix) return;
      if (s.fix) motion.observe(s.fix, Date.now());
      else motion.reset();
      send();
    });
    const timer = setInterval(send, HEARTBEAT_CHECK_MS);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []);

  return null;
}

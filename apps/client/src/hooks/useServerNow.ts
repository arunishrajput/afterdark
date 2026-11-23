import { useEffect, useState } from 'react';

import { useConnection } from '../store';

/** Estimated server time, re-rendering every `intervalMs` (PROTOCOL: countdowns use absolute deadlines). */
export function useServerNow(intervalMs: number, active = true): number {
  const offsetMs = useConnection((s) => s.offsetMs);
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now() + offsetMs);
    tick();
    const t = setInterval(tick, intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, offsetMs, active]);
  return now;
}

import { useEffect } from 'react';

import { useLocation } from '../store/location';

/**
 * Keeps the screen on while `active` (RULES §10.1: browsers stop GPS when the
 * screen locks) and takes the lock back when the tab becomes visible again.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const { setWakeLock } = useLocation.getState();
    if (!active) return;
    if (!('wakeLock' in navigator)) {
      setWakeLock('unsupported');
      return;
    }
    let sentinel: WakeLockSentinel | undefined;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible' || sentinel) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
        setWakeLock('held');
        lock.addEventListener('release', () => {
          sentinel = undefined;
          if (!cancelled) setWakeLock('idle');
        });
      } catch {
        setWakeLock('idle'); // refused (e.g. battery saver): we'll retry on the next visibilitychange
      }
    };

    void acquire();
    const onVisible = () => void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
      setWakeLock('idle');
    };
  }, [active]);
}

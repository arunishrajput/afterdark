/**
 * Coming back from the background (RULES §10): browsers pause GPS and sockets
 * when a phone locks or the tab is hidden. On return we nudge the connection,
 * restart the GPS watch and tell the player when their location went stale.
 */
import { DEFAULT_CONFIG } from '@afterdark/shared';

import { useGame } from '../store';
import { refreshWatch } from './geolocation';

const MS_PER_S = 1000;

/** Did the player stay away long enough for the server to call their fix stale (`staleAfterS`)? */
export function awayLongEnough(hiddenMs: number, staleAfterS: number): boolean {
  return hiddenMs > staleAfterS * MS_PER_S;
}

/** Phases where a stale location costs the player something (a running game, not the lobby). */
export function awayNoticeApplies(phase: string | undefined): boolean {
  return phase === 'spawning' || phase === 'reveal' || phase === 'playing';
}

export const AWAY_COPY = 'You were away. Your location went stale: it will catch up in a moment.';

/** Pure: should the "Reconnecting…" banner show? Only for someone already in a lobby, after a short grace. */
export function reconnectBannerVisible(
  inLobby: boolean,
  downSince: number | undefined,
  now: number,
  afterMs: number,
): boolean {
  return inLobby && downSince !== undefined && now - downSince >= afterMs;
}

export interface LifecycleHooks {
  /** The socket is down: connect now instead of waiting for the backoff timer. */
  reconnectNow: () => void;
  /** The socket claims to be up: check it is alive and re-sync the clock; on a dead link reconnect. */
  verifyLink: () => void;
}

let started = false;

export function startLifecycle(hooks: LifecycleHooks, connected: () => boolean): void {
  if (started) return;
  started = true;
  let hiddenAt: number | undefined;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    const away = hiddenAt === undefined ? 0 : Date.now() - hiddenAt;
    hiddenAt = undefined;
    refreshWatch(); // GPS may have died in the background (iOS especially)
    if (connected()) hooks.verifyLink();
    else hooks.reconnectNow();
    const phase = useGame.getState().view?.lobby.phase;
    if (awayNoticeApplies(phase) && awayLongEnough(away, DEFAULT_CONFIG.staleAfterS)) {
      useGame.getState().pushToast(AWAY_COPY);
    }
  });
  // The OS tells us the network came back: don't wait out the backoff.
  window.addEventListener('online', () => {
    if (!connected()) hooks.reconnectNow();
  });
}

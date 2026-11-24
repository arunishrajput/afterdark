import { DEFAULT_CONFIG } from '@afterdark/shared';
import { useEffect, useState } from 'react';

import { reconnectBannerVisible } from '../../net/lifecycle';
import { socket } from '../../net/socket';
import { useConnection, useGame } from '../../store';
import { Button } from './Button';

const CHECK_MS = 500;

/**
 * "Reconnecting…" while the socket is down, with a retry. The game keeps its
 * state on the server, so there is nothing to lose: the copy says so.
 */
export function ReconnectBanner() {
  const downSince = useConnection((s) => s.downSince);
  const inLobby = useGame((s) => s.view !== undefined);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (downSince === undefined) return;
    const t = setInterval(() => setNow(Date.now()), CHECK_MS);
    return () => clearInterval(t);
  }, [downSince]);
  if (!reconnectBannerVisible(inLobby, downSince, now, DEFAULT_CONFIG.reconnectBannerAfterMs)) {
    return null;
  }
  return (
    <div
      role="status"
      data-testid="reconnect-banner"
      className="fixed inset-x-0 top-0 z-[1100] border-b border-white/10 bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-2">
        <span className="flex items-center gap-2 text-sm">
          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-amber-400" />
          Reconnecting… your game is safe.
        </span>
        <Button
          variant="secondary"
          className="min-h-11 px-4 text-sm"
          onClick={() => {
            socket.disconnect().connect();
          }}
        >
          Retry now
        </Button>
      </div>
    </div>
  );
}

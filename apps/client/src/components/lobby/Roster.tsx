import { DEFAULT_CONFIG, type PublicPlayer } from '@afterdark/shared';
import { useEffect, useState } from 'react';

import { kickPlayer } from '../../net/actions';
import { messageFor } from '../../net/errors';
import { useGame } from '../../store';

const CONFIRM_MS = 3000;

function KickButton({ player }: { player: PublicPlayer }) {
  const [confirming, setConfirming] = useState(false);
  const pushToast = useGame((s) => s.pushToast);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [confirming]);

  const onClick = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    const res = await kickPlayer(player.id);
    if (!res.ok) pushToast(messageFor(res.code));
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      aria-label={confirming ? `Confirm kicking ${player.username}` : `Kick ${player.username}`}
      className={`min-h-11 min-w-11 touch-manipulation rounded-lg px-3 text-sm font-semibold transition ${
        confirming ? 'bg-danger text-bg' : 'text-muted hover:text-danger'
      }`}
    >
      {confirming ? 'Kick?' : '✕'}
    </button>
  );
}

export function Roster({
  players,
  meId,
  amHost,
}: {
  players: PublicPlayer[];
  meId: string;
  amHost: boolean;
}) {
  return (
    <section aria-labelledby="roster-title">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="roster-title" className="font-display text-lg font-bold">
          Players
        </h2>
        <span data-testid="player-count" className="font-mono text-sm text-muted">
          {players.length} / {DEFAULT_CONFIG.maxPlayers}
        </span>
      </div>
      <ul className="flex flex-col divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-surface">
        {players.map((p) => (
          <li
            key={p.id}
            data-testid="roster-row"
            data-ready={p.ready}
            className="flex min-h-14 items-center gap-3 px-4"
          >
            <span
              aria-label={p.connected ? 'online' : 'offline'}
              className={`size-2.5 shrink-0 rounded-full ${p.connected ? 'bg-emerald-400' : 'bg-white/20'}`}
            />
            <span className={`min-w-0 flex-1 truncate ${p.connected ? '' : 'text-muted'}`}>
              {p.username}
              {p.isHost && (
                <span className="ml-1.5" role="img" aria-label="host">
                  👑
                </span>
              )}
              {p.id === meId && <span className="ml-2 text-xs text-muted uppercase">you</span>}
            </span>
            <span
              className={`text-sm font-semibold ${p.ready ? 'text-accent' : 'text-muted'}`}
              data-testid="ready-state"
            >
              {p.ready ? 'Ready ✓' : 'Not ready'}
            </span>
            {amHost && p.id !== meId && <KickButton player={p} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

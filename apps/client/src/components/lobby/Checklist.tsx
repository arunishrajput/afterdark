import type { GameConfigPublic } from '@afterdark/shared';
import {
  DEFAULT_CONFIG,
  type PublicPlayer,
  type StartBlocker,
  startBlockers,
} from '@afterdark/shared';

/** Why the game can't start yet, from the same rules the server uses (RULES §3.7). */
export function Checklist({
  players,
  config,
  boundarySet,
}: {
  players: PublicPlayer[];
  config: GameConfigPublic;
  boundarySet: boolean;
}) {
  const readyCount = players.filter((p) => p.ready).length;
  const blockers = new Set<StartBlocker>(
    startBlockers(
      { ...DEFAULT_CONFIG, ...config },
      { playerCount: players.length, readyCount, boundarySet },
    ),
  );
  const items: { key: StartBlocker; label: string }[] = [
    {
      key: 'notEnoughPlayers',
      label: `At least ${DEFAULT_CONFIG.minPlayers} players (${Math.min(players.length, DEFAULT_CONFIG.minPlayers)}/${DEFAULT_CONFIG.minPlayers})`,
    },
    { key: 'tooManyImposters', label: 'Imposter count leaves enough crew' },
    { key: 'boundaryMissing', label: 'Playable area drawn on the map' },
    { key: 'notAllReady', label: `Everyone ready (${readyCount}/${players.length})` },
  ];
  return (
    <section aria-labelledby="checklist-title">
      <h2 id="checklist-title" className="mb-2 font-display text-lg font-bold">
        Before we start
      </h2>
      <ul className="flex flex-col gap-1.5 text-sm">
        {items.map(({ key, label }) => {
          const done = !blockers.has(key);
          return (
            <li
              key={key}
              className={`flex items-center gap-2 ${done ? 'text-text' : 'text-muted'}`}
            >
              <span aria-hidden="true" className={done ? 'text-accent' : ''}>
                {done ? '✓' : '○'}
              </span>
              <span>{label}</span>
              <span className="sr-only">{done ? '(done)' : '(not yet)'}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

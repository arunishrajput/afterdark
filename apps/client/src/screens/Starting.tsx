import type { PlayerView } from '@afterdark/shared';

import { Button } from '../components/ui/Button';
import { leaveLobby } from '../net/actions';

/** Placeholder for the `starting` phase until Phase 4 adds spawn → reveal → play. */
export function Starting({ view }: { view: PlayerView }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-semibold tracking-[0.3em] text-muted uppercase">
        Lobby {view.lobby.code}
      </p>
      <h1 data-testid="starting" className="font-display text-4xl font-bold">
        Game starting…
      </h1>
      <p className="text-muted">
        All {view.lobby.players.length} players are in. Spawn, roles and the map arrive in a later
        build.
      </p>
      <Button variant="ghost" onClick={() => void leaveLobby()}>
        Leave
      </Button>
    </main>
  );
}

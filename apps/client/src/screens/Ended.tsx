import type { EndReason, PlayerView, Winner } from '@afterdark/shared';

import { Button } from '../components/ui/Button';
import { leaveLobby } from '../net/actions';

const WINNER_TITLE: Record<Exclude<Winner, null> | 'none', string> = {
  crew: 'Crew wins',
  imposters: 'Imposters win',
  draw: 'It’s a draw',
  none: 'Game ended',
};

const REASON_TEXT: Record<EndReason, string> = {
  score: 'The crew reached the target score.',
  ejection: 'Every imposter was ejected.',
  infection: 'Enough of the crew was compromised.',
  time: 'Time ran out. The side with more progress wins.',
  forfeit: 'The other side left the game.',
  abort: 'The host ended the game.',
};

/** A minimal end screen: who won and why (the full results screen is Phase 12). */
export function Ended({ view }: { view: PlayerView }) {
  const result = view.game?.result;
  const title = WINNER_TITLE[result?.winner ?? 'none'];
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="text-xs font-semibold tracking-[0.3em] text-muted uppercase">
        Lobby {view.lobby.code}
      </p>
      <h1 data-testid="ended-title" className="font-display text-5xl font-bold">
        {title}
      </h1>
      {result && (
        <p data-testid="ended-reason" className="text-muted">
          {REASON_TEXT[result.reason]}
        </p>
      )}
      <Button data-testid="ended-leave" onClick={() => void leaveLobby()}>
        Back to start
      </Button>
    </main>
  );
}

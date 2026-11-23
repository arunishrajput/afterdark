import type { PlayerView } from '@afterdark/shared';

import {
  Leaderboard,
  MeetingHistory,
  ScoreChart,
  Timeline,
  WhoWasWho,
  WinnerBanner,
} from '../components/results/ResultsSections';
import { bannerFor, shareText } from '../components/results/resultsState';
import { Button } from '../components/ui/Button';
import { leaveLobby, playAgain } from '../net/actions';
import { messageFor } from '../net/errors';
import { useGame } from '../store';

/** The Web Share API (not on every desktop browser): a short text, no images. */
const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/**
 * The end of a game (UI_UX §2 › Results, Phase 12): the neutral theme, a winner banner with the
 * reason, who was who, the score chart, the timeline, the leaderboard and awards, the meetings,
 * then Play again (host) or "Waiting for the host…", and Leave. A game that ended before roles
 * existed (an abort in the spawn phase) has no `results`: the banner and the buttons remain.
 */
export function Results({ view }: { view: PlayerView }) {
  const { results } = view;
  const pushToast = useGame((s) => s.pushToast);
  const banner = bannerFor(
    results?.winner ?? view.game?.result?.winner ?? null,
    results?.reason ?? view.game?.result?.reason ?? 'abort',
  );

  const again = async () => {
    const res = await playAgain();
    if (!res.ok) pushToast(messageFor(res.code));
  };
  const share = async () => {
    if (!results) return;
    try {
      await navigator.share({ text: shareText(results, view.lobby.code) });
    } catch {
      // Closing the share sheet rejects: nothing to do.
    }
  };

  return (
    <main
      data-testid="results-screen"
      className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <p className="text-center text-xs font-semibold tracking-[0.3em] text-muted uppercase">
        Lobby {view.lobby.code}
      </p>
      <WinnerBanner banner={banner} results={results} />
      {results && (
        <>
          <WhoWasWho players={results.players} />
          <ScoreChart results={results} />
          <Leaderboard results={results} />
          <Timeline results={results} />
          <MeetingHistory results={results} />
        </>
      )}
      <div className="flex flex-col gap-3 pt-2">
        {view.me.isHost ? (
          <Button data-testid="results-play-again" onClick={() => void again()}>
            Play again
          </Button>
        ) : (
          <p data-testid="results-waiting" className="text-center text-muted">
            Waiting for the host…
          </p>
        )}
        {results && canShare && (
          <Button data-testid="results-share" variant="secondary" onClick={() => void share()}>
            Share result
          </Button>
        )}
        <Button data-testid="ended-leave" variant="secondary" onClick={() => void leaveLobby()}>
          Leave
        </Button>
      </div>
    </main>
  );
}

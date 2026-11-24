import { useState } from 'react';

import { abortGame, leaveLobby, pauseGame, resumeGame } from '../../net/actions';
import { messageFor } from '../../net/errors';
import { useGame } from '../../store';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { SoundToggle } from '../ui/SoundToggle';

/**
 * The game menu (UI_UX §5: "Leave game" is always reachable). The host also gets
 * pause/resume and abort (RULES §11). Everything else the host can do is an
 * ordinary player's.
 */
export function GameMenu({
  isHost,
  paused,
  canPause,
}: {
  isHost: boolean;
  paused: boolean;
  /** Pause only exists while the game is being played. */
  canPause: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<'abort' | 'leave' | undefined>();
  const pushToast = useGame((s) => s.pushToast);

  const run = async (act: () => ReturnType<typeof pauseGame>) => {
    const res = await act();
    if (!res.ok) pushToast(messageFor(res.code));
    else setOpen(false);
  };

  return (
    <>
      <Button
        variant="secondary"
        data-testid="game-menu"
        aria-label="Game menu"
        className="min-h-11 px-3"
        onClick={() => setOpen(true)}
      >
        ⋯
      </Button>
      <Sheet
        open={open}
        title="Game menu"
        onClose={() => {
          setOpen(false);
          setConfirming(undefined);
        }}
      >
        <div className="flex flex-col gap-3">
          <SoundToggle className="self-start" />
          {isHost && canPause && (
            <Button
              data-testid={paused ? 'resume-game' : 'pause-game'}
              variant="secondary"
              onClick={() => void run(paused ? resumeGame : pauseGame)}
            >
              {paused ? 'Resume the game' : 'Pause the game'}
            </Button>
          )}
          {isHost &&
            (confirming === 'abort' ? (
              <Button
                data-testid="abort-confirm"
                variant="danger"
                onClick={() => void run(abortGame)}
              >
                Yes, end the game for everyone
              </Button>
            ) : (
              <Button
                data-testid="abort-game"
                variant="danger"
                onClick={() => setConfirming('abort')}
              >
                Abort the game…
              </Button>
            ))}
          {confirming === 'leave' ? (
            <Button data-testid="leave-confirm" variant="danger" onClick={() => void leaveLobby()}>
              Yes, leave this game
            </Button>
          ) : (
            <Button
              data-testid="leave-game"
              variant="secondary"
              onClick={() => setConfirming('leave')}
            >
              Leave the game…
            </Button>
          )}
          <p className="text-xs text-muted">
            {confirming === 'leave'
              ? 'You can’t rejoin once you leave a running game.'
              : 'Take it slow: never run, and watch for traffic.'}
          </p>
        </div>
      </Sheet>
    </>
  );
}

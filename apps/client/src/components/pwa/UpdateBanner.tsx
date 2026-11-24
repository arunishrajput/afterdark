import { reloadForUpdate, updateBannerAllowed, usePwa } from '../../net/pwa';
import { useGame } from '../../store';
import { Button } from '../ui/Button';

/** "Update available" bar. Held back while a game is running; it appears in the lobby, on Home or on the results. */
export function UpdateBanner() {
  const ready = usePwa((s) => s.updateReady);
  const phase = useGame((s) => s.view?.lobby.phase);
  if (!ready || !updateBannerAllowed(phase)) return null;
  return (
    <div
      role="status"
      data-testid="update-banner"
      className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-2">
        <span className="text-sm">Update available.</span>
        <Button className="min-h-11 px-4 text-sm" onClick={reloadForUpdate}>
          Tap to reload
        </Button>
      </div>
    </div>
  );
}

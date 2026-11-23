import { useServerNow } from '../../hooks/useServerNow';
import { setReady } from '../../net/actions';
import { Button } from '../ui/Button';

const REFRESH_MS = 100;
const MS_PER_S = 1000;

export function CountdownOverlay({ endsAt }: { endsAt: number }) {
  const now = useServerNow(REFRESH_MS);
  const seconds = Math.max(0, Math.ceil((endsAt - now) / MS_PER_S));
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="countdown-title"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-bg/90 px-4 backdrop-blur-sm"
    >
      <p
        id="countdown-title"
        className="text-sm font-semibold tracking-[0.3em] text-muted uppercase"
      >
        Game starting
      </p>
      <p
        key={seconds}
        data-testid="countdown"
        aria-live="assertive"
        className="animate-count-pop font-mono text-9xl font-semibold drop-shadow-[0_0_32px_var(--accent-glow)]"
      >
        {seconds}
      </p>
      <Button variant="secondary" onClick={() => void setReady(false)}>
        Wait, I’m not ready
      </Button>
    </div>
  );
}

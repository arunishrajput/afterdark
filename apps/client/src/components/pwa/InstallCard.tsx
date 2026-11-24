import {
  dismissIosHint,
  isIosSafariBrowser,
  isStandalone,
  promptInstall,
  usePwa,
} from '../../net/pwa';
import { Button } from '../ui/Button';

/** Home's install prompt: a button on Android/Chromium, written steps on iOS Safari. Nothing once installed. */
export function InstallCard() {
  const installEvent = usePwa((s) => s.installEvent);
  const hintDismissed = usePwa((s) => s.iosHintDismissed);
  const installed = usePwa((s) => s.installed);
  if (installed || isStandalone()) return null;

  if (installEvent) {
    return (
      <Button variant="secondary" className="w-full" onClick={() => void promptInstall()}>
        Install AfterDark
      </Button>
    );
  }

  const ios = isIosSafariBrowser(navigator.userAgent, navigator.maxTouchPoints, false);
  if (!ios || hintDismissed) return null;
  return (
    <section
      data-testid="ios-install-hint"
      aria-label="Install on iPhone"
      className="rounded-2xl border border-white/10 bg-surface p-4 text-sm"
    >
      <h2 className="mb-1 font-display text-base font-bold">Install AfterDark</h2>
      <p className="text-muted">
        Tap <strong className="text-text">Share</strong> (the square with an arrow), then{' '}
        <strong className="text-text">Add to Home Screen</strong>. It opens full screen, like an
        app.
      </p>
      <Button variant="ghost" className="mt-2 min-h-11 px-0" onClick={dismissIosHint}>
        Not now
      </Button>
    </section>
  );
}

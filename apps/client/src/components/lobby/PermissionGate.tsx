/**
 * The location gate (UI_UX §2): why we need location and the screen on, an
 * Allow button, fixes for a blocked permission, and live accuracy. Ready stays
 * disabled until the server says the fix is good.
 */
import { DEFAULT_CONFIG, type PlayerView } from '@afterdark/shared';

import { geolocationSupported, startWatch } from '../../net/geolocation';
import { useLocation } from '../../store/location';
import { Button } from '../ui/Button';

const MAX_ACCURACY_M = DEFAULT_CONFIG.maxAccuracyM;

function Card({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'warn';
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby="gate-title"
      data-testid="permission-gate"
      className={`rounded-2xl border p-4 ${tone === 'warn' ? 'border-danger/40 bg-danger/5' : 'border-white/10 bg-surface'}`}
    >
      <h2 id="gate-title" className="mb-2 font-display text-lg font-bold">
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-sm text-muted">{children}</div>
    </section>
  );
}

function BlockedHelp() {
  return (
    <div className="flex flex-col gap-3">
      <details open className="rounded-xl border border-white/10 p-3">
        <summary className="min-h-6 cursor-pointer font-semibold text-text">
          iPhone (Safari)
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Settings → Privacy &amp; Security → Location Services → On.</li>
          <li>
            Location Services → Safari Websites → While Using the App, with Precise Location on.
          </li>
          <li>Come back here and tap Try again.</li>
        </ol>
      </details>
      <details className="rounded-xl border border-white/10 p-3">
        <summary className="min-h-6 cursor-pointer font-semibold text-text">
          Android (Chrome)
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Settings → Location → On, with Use precise location on.</li>
          <li>In Chrome: ⋮ → Settings → Site settings → Location → allow this site.</li>
          <li>Turn Battery Saver off for Chrome while you play, then tap Try again.</li>
        </ol>
      </details>
    </div>
  );
}

export function PermissionGate({ view, simulated }: { view: PlayerView; simulated: boolean }) {
  const permission = useLocation((s) => s.permission);
  const geoError = useLocation((s) => s.geoError);
  const fix = useLocation((s) => s.fix);
  const wakeLock = useLocation((s) => s.wakeLock);
  const quality = view.me.location?.quality;
  const accuracy = fix?.accuracy ?? view.me.location?.accuracy;

  if (quality === 'good') {
    return (
      <p
        data-testid="location-ok"
        className="flex items-center gap-2 text-sm text-text"
        role="status"
      >
        <span aria-hidden="true" className="text-accent">
          ✓
        </span>
        {simulated ? 'Simulated location' : 'Location ready'}
        {accuracy !== undefined && (
          <span className="font-mono text-muted">±{Math.round(accuracy)} m</span>
        )}
        {wakeLock === 'unsupported' && <span className="text-muted">· keep the screen on</span>}
      </p>
    );
  }

  if (simulated) {
    return (
      <Card tone="info" title="Waiting for the simulated fix">
        <p>The simulator sends its first position in a moment.</p>
      </Card>
    );
  }

  if (permission === 'unsupported' || !geolocationSupported()) {
    return (
      <Card tone="warn" title="This browser can’t share your location">
        <p>
          AfterDark needs your GPS position. Open this page in Safari (iPhone) or Chrome (Android)
          over HTTPS.
        </p>
      </Card>
    );
  }

  if (permission === 'denied') {
    return (
      <Card tone="warn" title="Location is blocked">
        <p>Without your position you can’t play. Allow location for this site, then try again.</p>
        <BlockedHelp />
        <Button data-testid="gate-retry" onClick={() => startWatch()}>
          Try again
        </Button>
      </Card>
    );
  }

  if (quality === 'stale') {
    return (
      <Card tone="warn" title="Location signal lost">
        <p>
          We haven’t had a position from your phone for a while. Keep this screen open and in the
          foreground, and check that GPS is on.
        </p>
      </Card>
    );
  }

  if (!fix && quality === undefined) {
    if (permission === 'granted') {
      return (
        <Card tone="info" title="Finding your location…">
          <p>
            {geoError === 'unavailable'
              ? 'Your phone can’t find a position yet. Check that location services are on.'
              : 'This can take a few seconds. Moving into the open helps.'}
          </p>
        </Card>
      );
    }
    return (
      <Card tone="info" title="Allow location">
        <p>
          AfterDark is played on foot, so it needs your GPS position to show you the map and to
          check where you are. Your position is only shared during the game, and never as a name.
        </p>
        <p>Keep this screen on while you play: phones pause GPS when they lock.</p>
        <Button data-testid="gate-allow" onClick={() => startWatch()}>
          Allow location
        </Button>
      </Card>
    );
  }

  // We have a fix but it isn't good yet.
  const weak = accuracy !== undefined && accuracy > MAX_ACCURACY_M;
  return (
    <Card tone="info" title={weak ? 'GPS is weak' : 'Almost there…'}>
      {accuracy !== undefined && (
        <p data-testid="gate-accuracy">
          Accuracy <span className="font-mono text-text">±{Math.round(accuracy)} m</span> (need ±
          {MAX_ACCURACY_M} m or better).
        </p>
      )}
      <p>
        {weak
          ? 'Step away from buildings and trees, or wait a few seconds for the signal to settle.'
          : 'Waiting for the server to confirm your position.'}
      </p>
    </Card>
  );
}

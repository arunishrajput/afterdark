import type { PlayerView } from '@afterdark/shared';
import { useCallback, useState } from 'react';

import { HowToPlay } from '../components/howto/HowToPlay';
import { howToSeen, markHowToSeen } from '../components/howto/seen';
import { AddBots } from '../components/lobby/AddBots';
import { Checklist } from '../components/lobby/Checklist';
import { CodeCard } from '../components/lobby/CodeCard';
import { CountdownOverlay } from '../components/lobby/CountdownOverlay';
import { PermissionGate } from '../components/lobby/PermissionGate';
import { Roster } from '../components/lobby/Roster';
import { SettingsSheet, SettingsSummary } from '../components/lobby/Settings';
import { MapPanel } from '../components/MapPanel';
import { Button } from '../components/ui/Button';
import { SoundToggle } from '../components/ui/SoundToggle';
import { VersionTag } from '../components/ui/VersionTag';
import { leaveLobby, setReady } from '../net/actions';
import { messageFor } from '../net/errors';
import { SimPanel } from '../sim/SimPanel';
import { useGame } from '../store';
import { useLocation } from '../store/location';

export function Lobby({ view }: { view: PlayerView }) {
  const { lobby, me } = view;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [hint, setHint] = useState(() => !howToSeen());
  const openHowTo = () => {
    markHowToSeen();
    setHint(false);
    setHowTo(true);
  };
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const pushToast = useGame((s) => s.pushToast);
  const simOn = useLocation((s) => s.sim.on);
  const simulated = lobby.testMode && simOn;
  const locationGood = me.location?.quality === 'good';

  const toggleReady = async () => {
    setBusy(true);
    const res = await setReady(!me.ready);
    setBusy(false);
    if (!res.ok) pushToast(messageFor(res.code));
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <span className="font-display text-xl font-bold">AfterDark</span>
        <div className="flex items-center gap-2">
          {lobby.testMode && (
            <span className="rounded-md border border-danger/50 px-2 py-0.5 font-mono text-xs font-semibold tracking-widest text-danger">
              TEST MODE
            </span>
          )}
          <SoundToggle />
        </div>
      </header>

      {hint && (
        <section
          data-testid="how-to-hint"
          aria-label="First time?"
          className="flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-surface p-4"
        >
          <p className="text-sm">New to AfterDark? The guide takes one minute.</p>
          <div className="flex shrink-0 gap-1">
            <Button className="min-h-11 px-4 text-sm" onClick={openHowTo}>
              How to play
            </Button>
            <Button
              variant="ghost"
              aria-label="Dismiss"
              className="min-h-11 min-w-11"
              onClick={() => {
                markHowToSeen();
                setHint(false);
              }}
            >
              ✕
            </Button>
          </div>
        </section>
      )}

      <CodeCard code={lobby.code} />
      <PermissionGate view={view} simulated={simulated} />
      <Roster players={lobby.players} meId={me.id} amHost={me.isHost} />
      <MapPanel view={view} simulated={simulated} onOpenSettings={openSettings} />
      <Checklist players={lobby.players} config={lobby.config} map={lobby.map} />

      <section
        aria-labelledby="settings-title"
        className="rounded-2xl border border-white/10 bg-surface p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="settings-title" className="font-display text-lg font-bold">
            Settings
          </h2>
          {me.isHost && (
            <Button variant="ghost" className="min-h-11 px-2" onClick={() => setSettingsOpen(true)}>
              Edit
            </Button>
          )}
        </div>
        <SettingsSummary config={lobby.config} />
        {!me.isHost && (
          <p className="mt-3 text-xs text-muted">Only the host can change settings.</p>
        )}
      </section>

      {lobby.testMode && me.isHost && <AddBots playerCount={lobby.players.length} />}
      {lobby.testMode && <SimPanel />}

      <Button variant="ghost" className="self-center" onClick={openHowTo}>
        How to play
      </Button>
      <VersionTag className="text-center" />

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="secondary" onClick={() => void leaveLobby()}>
            Leave
          </Button>
          <Button
            data-testid="ready-button"
            aria-pressed={me.ready}
            disabled={busy || (!me.ready && !locationGood)}
            onClick={() => void toggleReady()}
            className="flex-1 text-lg"
            variant={me.ready ? 'secondary' : 'primary'}
          >
            {me.ready ? 'Ready ✓ (tap to cancel)' : locationGood ? 'I’m ready' : 'Waiting for GPS…'}
          </Button>
        </div>
      </div>

      <HowToPlay open={howTo} onClose={() => setHowTo(false)} />

      {settingsOpen && (
        <SettingsSheet
          open
          config={lobby.config}
          playerCount={lobby.players.length}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {lobby.countdownEndsAt !== undefined && <CountdownOverlay endsAt={lobby.countdownEndsAt} />}
    </main>
  );
}

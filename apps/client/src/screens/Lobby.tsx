import type { PlayerView } from '@afterdark/shared';
import { useState } from 'react';

import { Checklist } from '../components/lobby/Checklist';
import { CodeCard } from '../components/lobby/CodeCard';
import { CountdownOverlay } from '../components/lobby/CountdownOverlay';
import { Roster } from '../components/lobby/Roster';
import { SettingsSheet, SettingsSummary } from '../components/lobby/Settings';
import { Button } from '../components/ui/Button';
import { leaveLobby, setReady } from '../net/actions';
import { messageFor } from '../net/errors';
import { useGame } from '../store';

export function Lobby({ view }: { view: PlayerView }) {
  const { lobby, me } = view;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pushToast = useGame((s) => s.pushToast);

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
        {lobby.testMode && (
          <span className="rounded-md border border-danger/50 px-2 py-0.5 font-mono text-xs font-semibold tracking-widest text-danger">
            TEST MODE
          </span>
        )}
      </header>

      <CodeCard code={lobby.code} />
      <Roster players={lobby.players} meId={me.id} amHost={me.isHost} />
      <Checklist players={lobby.players} config={lobby.config} />

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

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="secondary" onClick={() => void leaveLobby()}>
            Leave
          </Button>
          <Button
            data-testid="ready-button"
            aria-pressed={me.ready}
            disabled={busy}
            onClick={() => void toggleReady()}
            className="flex-1 text-lg"
            variant={me.ready ? 'secondary' : 'primary'}
          >
            {me.ready ? 'Ready ✓ (tap to cancel)' : 'I’m ready'}
          </Button>
        </div>
      </div>

      {settingsOpen && (
        <SettingsSheet open config={lobby.config} onClose={() => setSettingsOpen(false)} />
      )}
      {lobby.countdownEndsAt !== undefined && <CountdownOverlay endsAt={lobby.countdownEndsAt} />}
    </main>
  );
}

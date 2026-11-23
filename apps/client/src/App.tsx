import type { PlayerView } from '@afterdark/shared';
import { useEffect, useState } from 'react';

import { LocationProvider } from './components/LocationProvider';
import { Toasts } from './components/ui/Toasts';
import { Ended } from './screens/Ended';
import { EntryForm } from './screens/EntryForm';
import { Game } from './screens/Game';
import { type Entry, Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { NoticeScreen } from './screens/NoticeScreen';
import { RoleReveal } from './screens/RoleReveal';
import { Spawn } from './screens/Spawn';
import { parseSimParams } from './sim/params';
import { useGame } from './store';
import { useLocation } from './store/location';

/** `?code=` pre-fills Join (UI_UX §2). Read once on load; no URL router. */
const initialCode = new URLSearchParams(location.search).get('code')?.toUpperCase() ?? '';

/** `?sim=1&lat=&lng=` turns the GPS simulator on (it only takes effect while the lobby is in test mode). */
const simParams = parseSimParams(location.search);
useLocation.getState().patchSim({
  on: simParams.enabled,
  ...(simParams.start ? { ...simParams.start, placed: true } : {}),
});

/** The in-game screen for each room phase (ARCHITECTURE §7). */
function InGame({ view }: { view: PlayerView }) {
  switch (view.lobby.phase) {
    case 'lobby':
      return <Lobby view={view} />;
    case 'spawning':
      return <Spawn view={view} />;
    case 'reveal':
      return <RoleReveal view={view} />;
    case 'playing':
      return <Game view={view} />;
    case 'ended':
      return <Ended view={view} />;
  }
}

/** Crew blue and imposter red only while playing; everything else (lobby, spawn, reveal, results) is neutral (UI_UX §1). */
function themeOf(view: PlayerView | undefined): 'crew' | 'imposter' | 'neutral' {
  return view?.lobby.phase === 'playing' && view.me.role ? view.me.role : 'neutral';
}

function Screen() {
  const view = useGame((s) => s.view);
  const notice = useGame((s) => s.notice);
  const resuming = useGame((s) => s.resuming);
  const [entry, setEntry] = useState<Entry>();

  if (notice) return <NoticeScreen notice={notice} />;
  if (view) return <InGame view={view} />;
  if (resuming) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-muted" aria-busy="true">
        Reconnecting…
      </main>
    );
  }
  if (entry) return <EntryForm entry={entry} onBack={() => setEntry(undefined)} />;
  return <Home initialCode={initialCode} onEnter={setEntry} />;
}

export function App() {
  const theme = useGame((s) => themeOf(s.view));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const inLobby = useGame((s) => s.view !== undefined);
  const testMode = useGame((s) => s.view?.lobby.testMode === true);
  const simOn = useLocation((s) => s.sim.on);
  return (
    <>
      {inLobby && <LocationProvider simulated={testMode && simOn} />}
      <Screen />
      <Toasts />
    </>
  );
}

import { useState } from 'react';

import { LocationProvider } from './components/LocationProvider';
import { Toasts } from './components/ui/Toasts';
import { EntryForm } from './screens/EntryForm';
import { type Entry, Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { NoticeScreen } from './screens/NoticeScreen';
import { Starting } from './screens/Starting';
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

function Screen() {
  const view = useGame((s) => s.view);
  const notice = useGame((s) => s.notice);
  const resuming = useGame((s) => s.resuming);
  const [entry, setEntry] = useState<Entry>();

  if (notice) return <NoticeScreen notice={notice} />;
  if (view) return view.lobby.phase === 'lobby' ? <Lobby view={view} /> : <Starting view={view} />;
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

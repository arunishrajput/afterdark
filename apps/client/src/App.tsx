import type { PlayerView } from '@afterdark/shared';
import { lazy, Suspense, useEffect, useState } from 'react';

import { playTheme } from './components/game/disguise';
import { LocationProvider } from './components/LocationProvider';
import { UpdateBanner } from './components/pwa/UpdateBanner';
import { ReconnectBanner } from './components/ui/ReconnectBanner';
import { Toasts } from './components/ui/Toasts';
import { useServerNow } from './hooks/useServerNow';
import { EntryForm } from './screens/EntryForm';
import { type Entry, Home } from './screens/Home';
import { NoticeScreen } from './screens/NoticeScreen';
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

// The game screens load on demand: Home is all a first visit needs (the initial bundle budget, ARCHITECTURE §11).
const Lobby = lazy(() => import('./screens/Lobby').then((m) => ({ default: m.Lobby })));
const Spawn = lazy(() => import('./screens/Spawn').then((m) => ({ default: m.Spawn })));
const RoleReveal = lazy(() =>
  import('./screens/RoleReveal').then((m) => ({ default: m.RoleReveal })),
);
const Game = lazy(() => import('./screens/Game').then((m) => ({ default: m.Game })));
const Spectator = lazy(() => import('./screens/Spectator').then((m) => ({ default: m.Spectator })));
const Results = lazy(() => import('./screens/Results').then((m) => ({ default: m.Results })));
const MeetingScreen = lazy(() =>
  import('./components/meeting/MeetingScreen').then((m) => ({ default: m.MeetingScreen })),
);

function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center text-muted" aria-busy="true">
      Loading…
    </main>
  );
}

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
      if (view.game?.meeting) return <MeetingScreen view={view} meeting={view.game.meeting} />;
      return view.me.status === 'spectator' ? <Spectator view={view} /> : <Game view={view} />;
    case 'ended':
      return <Results view={view} />;
  }
}

/** Crew blue and imposter red only while playing a normal screen; everything else (lobby, spawn, reveal, meetings, spectators, results) is neutral (UI_UX §1, ADR-028). */
function themeOf(view: PlayerView | undefined, now: number): 'crew' | 'imposter' | 'neutral' {
  if (view?.lobby.phase !== 'playing' || !view.me.role) return 'neutral';
  if (view.game?.meeting || view.me.status === 'spectator') return 'neutral';
  // A disguised imposter (Camouflage) wears crew blue, and snaps back to red when it ends.
  return playTheme(view, now);
}

const THEME_REFRESH_MS = 500;

/** The browser or status bar colour follows the theme's background (tokens.css `--bg`). */
const THEME_COLOR = { crew: '#05070d', imposter: '#0d0505', neutral: '#07080a' } as const;

function Screen() {
  const view = useGame((s) => s.view);
  const notice = useGame((s) => s.notice);
  const resuming = useGame((s) => s.resuming);
  const [entry, setEntry] = useState<Entry>();

  if (notice) return <NoticeScreen notice={notice} />;
  if (view) {
    return (
      <Suspense fallback={<Loading />}>
        <InGame view={view} />
      </Suspense>
    );
  }
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
  const view = useGame((s) => s.view);
  const now = useServerNow(THEME_REFRESH_MS, view?.me.imposter?.camouflage !== undefined);
  const theme = themeOf(view, now);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  }, [theme]);
  const inLobby = useGame((s) => s.view !== undefined);
  const testMode = useGame((s) => s.view?.lobby.testMode === true);
  const simOn = useLocation((s) => s.sim.on);
  return (
    <>
      {inLobby && <LocationProvider simulated={testMode && simOn} />}
      <Screen />
      <UpdateBanner />
      <ReconnectBanner />
      <Toasts />
    </>
  );
}

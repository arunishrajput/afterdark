import './styles/index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import {
  devAdvanceClock,
  devForceCoop,
  devSetMinigames,
  devUpdateConfig,
  simTeleport,
} from './net/actions';
import { startConnection } from './net/socket';
import { useGame } from './store';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

startConnection();

// Test hook (like `window.__afterdarkMap`): lets Playwright pick the minigame under test and hop to a place. Dev builds and `?sim` pages only.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('sim')) {
  (window as unknown as { __afterdarkActions?: object }).__afterdarkActions = {
    devSetMinigames,
    devAdvanceClock,
    devForceCoop,
    devUpdateConfig,
    simTeleport,
    /** Ids and tags of the players this view can name (public roster ids; the viewer's own tag). */
    myIds: () => {
      const v = useGame.getState().view;
      return { me: v?.me.id, tag: v?.me.tag, players: v?.lobby.players.map((p) => p.id) ?? [] };
    },
    /** The viewer's own task cards. */
    cardsOf: () => useGame.getState().view?.game?.tasks ?? [],
    /** The Base's position (it is on everyone's map): where a test sends its simulated players for a meeting. */
    baseOf: () => useGame.getState().view?.lobby.map.base,
    /** A Phantom's own fakes (where a test sends the crew player who will be fooled). */
    fakesOf: () => useGame.getState().view?.me.imposter?.fakes ?? [],
  };
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import './styles/index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { devAdvanceClock, devSetMinigames, simTeleport } from './net/actions';
import { startConnection } from './net/socket';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

startConnection();

// Test hook (like `window.__afterdarkMap`): lets Playwright pick the minigame under test and hop to a place. Dev builds and `?sim` pages only.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('sim')) {
  (window as unknown as { __afterdarkActions?: object }).__afterdarkActions = {
    devSetMinigames,
    devAdvanceClock,
    simTeleport,
  };
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

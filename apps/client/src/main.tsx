import './styles/index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { startConnection } from './net/socket';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

startConnection();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

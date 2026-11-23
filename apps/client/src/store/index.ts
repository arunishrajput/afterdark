import type { GameEvent, PlayerView } from '@afterdark/shared';
import { create } from 'zustand';

import type { ClockSample } from '../net/clock';

export type ConnectionStatus = 'connecting' | 'connected';

interface ConnectionState {
  status: ConnectionStatus;
  rttMs: number | undefined;
  offsetMs: number;
  setStatus: (status: ConnectionStatus) => void;
  setClock: (sample: ClockSample) => void;
}

export const useConnection = create<ConnectionState>()((set) => ({
  status: 'connecting',
  rttMs: undefined,
  offsetMs: 0,
  setStatus: (status) => set({ status }),
  setClock: ({ rttMs, offsetMs }) => set({ rttMs, offsetMs }),
}));

/** A blocking message that replaces the normal screens until dismissed. */
export type Notice = { kind: 'kicked' } | { kind: 'replaced' } | { kind: 'ended' };

export interface Toast {
  id: number;
  text: string;
}

interface GameState {
  /** Latest server snapshot for this player; undefined when not in a lobby. */
  view: PlayerView | undefined;
  /** True while a saved session is being resumed after (re)connecting. */
  resuming: boolean;
  notice: Notice | undefined;
  toasts: Toast[];
  setView: (view: PlayerView) => void;
  clearView: () => void;
  setResuming: (resuming: boolean) => void;
  setNotice: (notice: Notice | undefined) => void;
  pushToast: (text: string) => void;
  dismissToast: (id: number) => void;
}

let nextToastId = 1;

export const useGame = create<GameState>()((set) => ({
  view: undefined,
  resuming: false,
  notice: undefined,
  toasts: [],
  setView: (view) =>
    set((s) => {
      // Ignore a stale snapshot for the same player (views carry an increasing `v`).
      if (s.view && s.view.me.id === view.me.id && view.v <= s.view.v) return s;
      return { view };
    }),
  clearView: () => set({ view: undefined }),
  setResuming: (resuming) => set({ resuming }),
  setNotice: (notice) => set({ notice }),
  pushToast: (text) => set((s) => ({ toasts: [...s.toasts, { id: nextToastId++, text }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Toast copy for server events (UI_UX §4: short and imperative). */
export function toastFor(event: GameEvent): string | undefined {
  switch (event.type) {
    case 'lobby.countdownCancelled':
      return 'Countdown cancelled';
    case 'lobby.configChanged':
      return 'Settings changed. Everyone is un-readied.';
    case 'lobby.countdown':
      return undefined; // the countdown overlay shows it
  }
}

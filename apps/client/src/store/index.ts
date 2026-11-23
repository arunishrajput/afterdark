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

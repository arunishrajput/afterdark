/** The one Socket.IO connection for this tab (same origin; Vite proxies in dev). */
import {
  type Ack,
  type ClientToServerEvents,
  DEFAULT_CONFIG,
  type ServerToClientEvents,
  type TimePingAck,
} from '@afterdark/shared';
import { io, type Socket } from 'socket.io-client';

import { useConnection } from '../store';
import { bestEstimate, type ClockSample, sampleFromPing } from './clock';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: GameSocket = io({ autoConnect: false });

async function ping(): Promise<ClockSample | undefined> {
  const sentAt = Date.now();
  try {
    // `.timeout()` makes socket.io-client type the ack as `any`; pin the real shape.
    const res = (await socket
      .timeout(DEFAULT_CONFIG.ackTimeoutMs)
      .emitWithAck('time:ping', { clientTs: sentAt })) as Ack<TimePingAck>;
    return res.ok ? sampleFromPing(sentAt, res.data.serverTs, Date.now()) : undefined;
  } catch {
    return undefined; // timed out; the next sync will retry
  }
}

async function syncClock(): Promise<void> {
  const samples: ClockSample[] = [];
  for (let i = 0; i < DEFAULT_CONFIG.clockSyncSamples && socket.connected; i++) {
    const s = await ping();
    if (s) samples.push(s);
  }
  const best = bestEstimate(samples);
  if (best) useConnection.getState().setClock(best);
}

let started = false;

/** Connects once and keeps the connection status and clock offset in the store. */
export function startConnection(): void {
  if (started) return;
  started = true;
  const { setStatus } = useConnection.getState();
  let timer: ReturnType<typeof setInterval> | undefined;

  socket.on('connect', () => {
    setStatus('connected');
    void syncClock();
    clearInterval(timer);
    timer = setInterval(() => void syncClock(), DEFAULT_CONFIG.clockSyncIntervalMs);
  });
  socket.on('disconnect', () => {
    setStatus('connecting');
    clearInterval(timer);
  });
  socket.io.on('reconnect_attempt', () => setStatus('connecting'));
  socket.connect();
}

/** The one Socket.IO connection for this tab (same origin; Vite proxies in dev). */
import {
  type Ack,
  type AckCallback,
  type ClientToServerEvents,
  DEFAULT_CONFIG,
  type ServerToClientEvents,
} from '@afterdark/shared';
import { io, type Socket } from 'socket.io-client';

import { toastFor, useConnection, useGame } from '../store';
import { bestEstimate, type ClockSample, sampleFromPing } from './clock';
import type { ClientErrorCode } from './errors';
import { clearSession, loadSession } from './persist';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: GameSocket = io({ autoConnect: false });

type AckData<E extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[E]>[1] extends AckCallback<infer T> ? T : never;

export type RequestResult<T> =
  { ok: true; data: T } | { ok: false; code: ClientErrorCode; message: string };

/** Emits a client → server event and waits for its ack (or times out). */
export async function request<E extends keyof ClientToServerEvents>(
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
): Promise<RequestResult<AckData<E>>> {
  try {
    // `.timeout()` makes socket.io-client type the ack loosely; pin the real shape.
    // Never store `emitWithAck` in a variable: it loses `this`.
    const timed = socket.timeout(DEFAULT_CONFIG.ackTimeoutMs) as unknown as {
      emitWithAck(ev: string, p: unknown): Promise<Ack<AckData<E>>>;
    };
    const res = await timed.emitWithAck(event, payload);
    return res.ok ? res : { ok: false, code: res.error.code, message: res.error.message };
  } catch {
    return { ok: false, code: 'TIMEOUT', message: 'No answer from the server' };
  }
}

async function ping(): Promise<ClockSample | undefined> {
  const sentAt = Date.now();
  const res = await request('time:ping', { clientTs: sentAt });
  return res.ok ? sampleFromPing(sentAt, res.data.serverTs, Date.now()) : undefined;
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

/** On (re)connect, re-bind this tab to its saved player (ARCHITECTURE §6). */
async function resumeSaved(): Promise<void> {
  const saved = loadSession();
  const game = useGame.getState();
  if (!saved) {
    game.setResuming(false);
    return;
  }
  game.setResuming(true);
  const res = await request('session:resume', { token: saved.token });
  game.setResuming(false);
  if (res.ok) return; // the server pushes a fresh view
  if (res.code === 'TIMEOUT') return; // keep the session; the next reconnect retries
  clearSession();
  game.clearView();
  game.setNotice(res.code === 'KICKED' ? { kind: 'kicked' } : { kind: 'ended' });
}

let started = false;

/** Connects once and wires views, events, kicks, clock sync and auto-resume. */
export function startConnection(): void {
  if (started) return;
  started = true;
  const { setStatus } = useConnection.getState();
  const game = useGame.getState();
  let timer: ReturnType<typeof setInterval> | undefined;

  if (loadSession()) game.setResuming(true);

  socket.on('connect', () => {
    setStatus('connected');
    void resumeSaved();
    void syncClock();
    clearInterval(timer);
    timer = setInterval(() => void syncClock(), DEFAULT_CONFIG.clockSyncIntervalMs);
  });
  socket.on('disconnect', () => {
    setStatus('connecting');
    clearInterval(timer);
  });
  socket.io.on('reconnect_attempt', () => setStatus('connecting'));

  socket.on('view', (view) => useGame.getState().setView(view));
  socket.on('event', (event) => {
    const text = toastFor(event);
    if (text) useGame.getState().pushToast(text);
  });
  socket.on('kicked', ({ reason }) => {
    const g = useGame.getState();
    if (reason === 'kicked') {
      clearSession();
      g.clearView();
      g.setNotice({ kind: 'kicked' });
    } else {
      // Another tab took over this session; keep it saved so "Use here" can resume.
      g.setNotice({ kind: 'replaced' });
    }
  });

  socket.connect();
}

/** After "replaced": reconnect this tab, which resumes and takes the session back. */
export function reclaimSession(): void {
  useGame.getState().setNotice(undefined);
  if (!socket.connected) socket.connect();
  else void resumeSaved();
}

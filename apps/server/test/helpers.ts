/** Integration-test helpers: an in-process server with a controllable clock and typed clients. */
import type { AddressInfo } from 'node:net';

import type {
  Ack,
  AckCallback,
  ClientToServerEvents,
  GameEvent,
  KickedPayload,
  PlayerView,
  ServerToClientEvents,
} from '@afterdark/shared';
import { createRng } from '@afterdark/shared';
import { io as connect, type Socket } from 'socket.io-client';

import { createServer, type GameServer } from '../src/app';
import { createLogger } from '../src/logger';
import { rngCodeSource } from '../src/rooms/lobbyCode';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const T0 = 1_700_000_000_000;
const ACK_TIMEOUT_MS = 2000;
const WAIT_TIMEOUT_MS = 3000;
const POLL_MS = 5;

type AckData<E extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[E]>[1] extends AckCallback<infer T> ? T : never;

export interface TestServer {
  server: GameServer;
  url: string;
  clock: { now: number };
  close(): Promise<void>;
}

export async function startTestServer(opts: { allowTestMode?: boolean } = {}): Promise<TestServer> {
  const clock = { now: T0 };
  const server = createServer({
    logger: createLogger({ level: 'silent', pretty: false }),
    now: () => clock.now,
    version: { sha: 'test-sha' },
    allowTestMode: opts.allowTestMode ?? true,
    codeSource: rngCodeSource(createRng(42)),
  });
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  const { port } = server.httpServer.address() as AddressInfo;
  return { server, url: `http://localhost:${port}`, clock, close: () => server.close() };
}

/** Polls until `check` returns a value (not undefined/false), or times out. */
export async function waitFor<T>(
  check: () => T | undefined | false,
  what = 'condition',
): Promise<T> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    const v = check();
    if (v !== undefined && v !== false) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

export class TestClient {
  readonly socket: ClientSocket;
  view: PlayerView | undefined;
  readonly views: PlayerView[] = [];
  readonly events: GameEvent[] = [];
  kicked: KickedPayload | undefined;
  /** Every server → client frame, serialised, for raw leak scans. */
  readonly frames: string[] = [];

  constructor(url: string) {
    this.socket = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    this.socket.on('view', (v) => {
      this.view = v;
      this.views.push(v);
    });
    this.socket.on('event', (e) => this.events.push(e));
    this.socket.on('kicked', (k) => (this.kicked = k));
    this.socket.onAny((event: string, ...args: unknown[]) => {
      this.frames.push(JSON.stringify([event, ...args]));
    });
  }

  async connected(): Promise<this> {
    if (this.socket.connected) return this;
    await new Promise<void>((resolve, reject) => {
      this.socket.once('connect', resolve);
      this.socket.once('connect_error', reject);
    });
    return this;
  }

  async call<E extends keyof ClientToServerEvents>(
    event: E,
    payload: Parameters<ClientToServerEvents[E]>[0],
  ): Promise<Ack<AckData<E>>> {
    // socket.io-client types `.timeout().emitWithAck` loosely; pin the ack shape.
    const emit = this.socket.timeout(ACK_TIMEOUT_MS) as unknown as {
      emitWithAck(ev: string, p: unknown): Promise<Ack<AckData<E>>>;
    };
    return emit.emitWithAck(event, payload);
  }

  /** Like `call`, but throws on a failed ack and returns the data. */
  async ok<E extends keyof ClientToServerEvents>(
    event: E,
    payload: Parameters<ClientToServerEvents[E]>[0],
  ): Promise<AckData<E>> {
    const res = await this.call(event, payload);
    if (!res.ok) throw new Error(`${event} failed: ${res.error.code} ${res.error.message}`);
    return res.data;
  }

  waitForView(predicate: (v: PlayerView) => boolean, what = 'view'): Promise<PlayerView> {
    return waitFor(() => (this.view && predicate(this.view) ? this.view : undefined), what);
  }

  close(): void {
    this.socket.disconnect();
  }
}

export async function openClient(url: string): Promise<TestClient> {
  return new TestClient(url).connected();
}

export const errorCode = (res: Ack<unknown>) => (res.ok ? 'OK' : res.error.code);

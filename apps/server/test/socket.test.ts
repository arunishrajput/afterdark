import type { AddressInfo } from 'node:net';

import type {
  Ack,
  ClientToServerEvents,
  ServerToClientEvents,
  TimePingAck,
} from '@afterdark/shared';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createServer, type GameServer } from '../src/app';
import { createLogger } from '../src/logger';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const FAKE_NOW = 1_700_000_000_000;
const ACK_TIMEOUT_MS = 2000;

/** `emitWithAck` behind `.timeout()` is typed `any` by socket.io-client; pin it. */
const ping = async (socket: ClientSocket, payload: unknown): Promise<Ack<TimePingAck>> =>
  (await socket
    .timeout(ACK_TIMEOUT_MS)
    .emitWithAck('time:ping', payload as { clientTs: number })) as Ack<TimePingAck>;

describe('server (in-process)', () => {
  let server: GameServer;
  let url: string;
  let client: ClientSocket | undefined;

  beforeEach(async () => {
    server = createServer({
      logger: createLogger({ level: 'silent', pretty: false }),
      now: () => FAKE_NOW,
      version: { sha: 'test-sha' },
    });
    await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
    const { port } = server.httpServer.address() as AddressInfo;
    url = `http://localhost:${port}`;
  });

  afterEach(async () => {
    client?.disconnect();
    client = undefined;
    await server.close();
  });

  const open = async (): Promise<ClientSocket> => {
    const socket: ClientSocket = connect(url, { transports: ['websocket'], forceNew: true });
    client = socket;
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  };

  it('GET /health → {ok:true}', async () => {
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('GET /version → {sha}', async () => {
    const res = await fetch(`${url}/version`);
    expect(await res.json()).toEqual({ sha: 'test-sha' });
  });

  it('time:ping acks with the server clock', async () => {
    const socket = await open();
    const res = await ping(socket, { clientTs: 42 });
    expect(res).toEqual({ ok: true, data: { serverTs: FAKE_NOW } });
  });

  it('time:ping with an invalid payload acks INVALID_PAYLOAD', async () => {
    const socket = await open();
    // Deliberately wrong payload to prove zod validation runs first.
    const res = await ping(socket, { clientTs: 'nope' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('INVALID_PAYLOAD');
  });

  it('survives an event sent without an ack callback', async () => {
    const socket = await open();
    (socket.emit as (ev: string, payload: unknown) => void)('time:ping', { clientTs: 1 });
    const res = await ping(socket, { clientTs: 2 });
    expect(res.ok).toBe(true);
  });
});

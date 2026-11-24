/**
 * Phase 14 limits over real sockets (ADR-107): lobby creation per address and
 * server-wide, the 16 KB payload cap, and that each limit leaves the server
 * serving everyone else.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  errorCode,
  openClient,
  startTestServer,
  type TestClient,
  type TestServer,
  waitFor,
} from './helpers';

const SAFE = { acceptedSafety: true } as const;
const MINUTE_MS = 60_000;
/** A client behind our (loopback) proxy, as on Render: the proxy appends the address it saw. */
const from = (ip: string) => ({ 'x-forwarded-for': ip });

describe('lobby creation limits', () => {
  let ts: TestServer | undefined;
  const clients: TestClient[] = [];
  const open = async (headers?: Record<string, string>) => {
    const c = await openClient(ts?.url ?? '', headers);
    clients.push(c);
    return c;
  };
  const create = async (headers?: Record<string, string>) =>
    (await open(headers)).call('lobby:create', { username: 'Ann', ...SAFE });

  afterEach(async () => {
    for (const c of clients.splice(0)) c.close();
    await ts?.close();
  });

  it('one address may create perIpPerMin lobbies a minute; others and joins are unaffected', async () => {
    ts = await startTestServer({ lobbyLimits: { perIpPerMin: 2, exemptLoopback: false } });
    const first = await create(from('203.0.113.7'));
    expect(first.ok).toBe(true);
    expect(errorCode(await create(from('203.0.113.7')))).toBe('OK');
    expect(errorCode(await create(from('203.0.113.7')))).toBe('RATE_LIMITED');
    // A different address still can.
    expect(errorCode(await create(from('198.51.100.2')))).toBe('OK');
    // Joining is never limited, even from the limited address.
    const code = first.ok ? first.data.code : '';
    const guest = await open(from('203.0.113.7'));
    expect(errorCode(await guest.call('lobby:join', { code, username: 'Bob', ...SAFE }))).toBe(
      'OK',
    );
    // A minute later the address may create again.
    ts.clock.now += MINUTE_MS;
    expect(errorCode(await create(from('203.0.113.7')))).toBe('OK');
  });

  it('a client cannot dodge the limit by sending its own X-Forwarded-For through the proxy', async () => {
    ts = await startTestServer({ lobbyLimits: { perIpPerMin: 1, exemptLoopback: false } });
    // The proxy appends the real address last; whatever the client put first is ignored.
    expect(errorCode(await create(from('1.1.1.1, 203.0.113.7')))).toBe('OK');
    expect(errorCode(await create(from('2.2.2.2, 203.0.113.7')))).toBe('RATE_LIMITED');
  });

  it('loopback is exempt by default (local dev, e2e, local load tests)', async () => {
    ts = await startTestServer({ lobbyLimits: { perIpPerMin: 1 } });
    for (let i = 0; i < 4; i++) expect(errorCode(await create())).toBe('OK');
  });

  it(`refuses new lobbies with SERVER_BUSY at maxLobbies, until one closes`, async () => {
    ts = await startTestServer({ lobbyLimits: { maxLobbies: 2 } });
    const a = await open();
    await a.ok('lobby:create', { username: 'Ann', ...SAFE });
    expect(errorCode(await create())).toBe('OK');
    expect(errorCode(await create())).toBe('SERVER_BUSY');
    expect(ts.server.rooms.size).toBe(2);
    await a.ok('lobby:leave', {}); // the last player leaving deletes the lobby
    expect(errorCode(await create())).toBe('OK');
  });
});

describe('payload cap', () => {
  let ts: TestServer | undefined;
  afterEach(async () => {
    await ts?.close();
  });

  it('a frame over 16 KB closes that socket only; the server keeps serving others', async () => {
    ts = await startTestServer();
    const bystander = await openClient(ts.url);
    const attacker = await openClient(ts.url);
    // Emitted without an ack: the server drops the connection before any handler runs.
    (attacker.socket as unknown as { emit(ev: string, p: unknown): void }).emit('lobby:create', {
      username: 'x'.repeat(20 * 1024),
      ...SAFE,
    });
    await waitFor(() => !attacker.socket.connected, 'oversized sender disconnected');
    expect((await bystander.call('time:ping', { clientTs: 1 })).ok).toBe(true);
    expect(ts.server.rooms.size).toBe(0);
    bystander.close();
  });
});

import { DEFAULT_CONFIG } from '@afterdark/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  errorCode,
  openClient,
  startTestServer,
  type TestClient,
  type TestServer,
  waitFor,
} from './helpers';

const SAFE = { acceptedSafety: true } as const;

describe('gateway: sessions and validation', () => {
  let ts: TestServer;
  const clients: TestClient[] = [];
  const open = async () => {
    const c = await openClient(ts.url);
    clients.push(c);
    return c;
  };

  beforeEach(async () => {
    ts = await startTestServer();
  });

  afterEach(async () => {
    for (const c of clients.splice(0)) c.close();
    await ts.close();
  });

  it('lobby:create returns a code, token and player id, then sends the first view', async () => {
    const host = await open();
    const { code, token, playerId } = await host.ok('lobby:create', { username: 'Ann', ...SAFE });
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(token.length).toBeGreaterThanOrEqual(22);
    const view = await host.waitForView((v) => v.me.id === playerId);
    expect(view.lobby).toMatchObject({ code, hostId: playerId, phase: 'lobby' });
  });

  it('rejects invalid payloads and unknown codes with the right error codes', async () => {
    const c = await open();
    expect(
      errorCode(await c.call('lobby:create', { username: 'Ann', acceptedSafety: false as true })),
    ).toBe('INVALID_PAYLOAD');
    expect(
      errorCode(await c.call('lobby:join', { code: 'ZZZZZZ', username: 'Ann', ...SAFE })),
    ).toBe('NOT_FOUND');
    expect(errorCode(await c.call('lobby:setReady', { ready: true }))).toBe('NOT_FOUND');
  });

  it('a socket already in a lobby cannot create or join another', async () => {
    const host = await open();
    const { code } = await host.ok('lobby:create', { username: 'Ann', ...SAFE });
    expect(errorCode(await host.call('lobby:create', { username: 'Ann', ...SAFE }))).toBe(
      'NOT_ALLOWED',
    );
    expect(errorCode(await host.call('lobby:join', { code, username: 'Bob', ...SAFE }))).toBe(
      'NOT_ALLOWED',
    );
  });

  it('a newer socket for the same session replaces the older one', async () => {
    const host = await open();
    const { code, token, playerId } = await host.ok('lobby:create', { username: 'Ann', ...SAFE });
    const tab2 = await open();
    expect(await tab2.ok('session:resume', { token })).toEqual({ playerId, code });
    await waitFor(() => host.kicked, 'old tab kicked');
    expect(host.kicked).toEqual({ reason: 'replaced' });
    await waitFor(() => !host.socket.connected, 'old tab disconnected');
    const view = await tab2.waitForView((v) => v.me.id === playerId);
    // The replaced socket's disconnect must not mark the player offline.
    expect(view.lobby.players[0]?.connected).toBe(true);
    expect(ts.server.rooms.get(code)?.state.players[0]?.connected).toBe(true);
  });

  it('a kicked player is disconnected and their token cannot resume', async () => {
    const host = await open();
    const { code } = await host.ok('lobby:create', { username: 'Ann', ...SAFE });
    const guest = await open();
    const { token, playerId } = await guest.ok('lobby:join', { code, username: 'Bob', ...SAFE });
    await host.ok('lobby:kick', { playerId });
    await waitFor(() => guest.kicked, 'kicked event');
    expect(guest.kicked).toEqual({ reason: 'kicked' });
    await host.waitForView((v) => v.lobby.players.length === 1, 'roster without guest');
    const again = await open();
    expect(errorCode(await again.call('session:resume', { token }))).toBe('KICKED');
  });

  it('leaving ends the session; the last player leaving deletes the lobby', async () => {
    const host = await open();
    const { code, token } = await host.ok('lobby:create', { username: 'Ann', ...SAFE });
    await host.ok('lobby:leave', {});
    expect(ts.server.rooms.get(code)).toBeUndefined();
    expect(errorCode(await host.call('session:resume', { token }))).toBe('NOT_FOUND');
    // The socket is free to create a new lobby.
    expect((await host.call('lobby:create', { username: 'Ann', ...SAFE })).ok).toBe(true);
  });

  it('refuses test mode when ALLOW_TEST_MODE is off', async () => {
    await ts.close();
    ts = await startTestServer({ allowTestMode: false });
    const host = await open();
    await host.ok('lobby:create', { username: 'Ann', ...SAFE });
    expect(errorCode(await host.call('lobby:updateConfig', { patch: { testMode: true } }))).toBe(
      'NOT_ALLOWED',
    );
  });

  it(`rate-limits a socket to ${DEFAULT_CONFIG.socketEventsPerSecond} events per second`, async () => {
    const c = await open();
    const burst = await Promise.all(
      Array.from({ length: DEFAULT_CONFIG.socketEventsPerSecond + 5 }, (_, i) =>
        c.call('time:ping', { clientTs: i }),
      ),
    );
    const limited = burst.filter((r) => errorCode(r) === 'RATE_LIMITED').length;
    expect(limited).toBe(5);
  });
});

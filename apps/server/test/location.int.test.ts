/** Phase 2 over real sockets: fixes, boundary, ready gate, radar, teleport, rate limit. */
import { DEFAULT_CONFIG, offsetByMeters } from '@afterdark/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  errorCode,
  HOME,
  openClient,
  startTestServer,
  type TestClient,
  type TestServer,
  waitFor,
} from './helpers';

const SAFE = { acceptedSafety: true } as const;
const CIRCLE = { type: 'circle', center: HOME, radiusM: 120 } as const;

describe('location, boundary and radar over sockets', () => {
  let ts: TestServer;
  const all: TestClient[] = [];

  beforeEach(async () => {
    ts = await startTestServer();
  });
  afterEach(async () => {
    for (const c of all.splice(0)) c.close();
    await ts.close();
  });

  async function lobbyOf(names: string[]) {
    const clients: TestClient[] = [];
    let code = '';
    for (const [i, name] of names.entries()) {
      const c = await openClient(ts.url);
      all.push(c);
      if (i === 0) code = (await c.ok('lobby:create', { username: name, ...SAFE })).code;
      else await c.ok('lobby:join', { code, username: name, ...SAFE });
      clients.push(c);
    }
    return { code, clients };
  }

  it('the host’s boundary reaches every client; invalid ones get a clear error', async () => {
    const { clients } = await lobbyOf(['Host', 'Bea']);
    const [host, bea] = clients as [TestClient, TestClient];
    const res = await host.ok('lobby:setBoundary', { boundary: CIRCLE });
    expect(res.areaM2).toBeGreaterThan(Math.PI * 120 * 120 * 0.99);
    for (const c of clients) {
      const v = await c.waitForView((x) => x.lobby.map.boundary !== undefined, 'boundary');
      expect(v.lobby.map.boundary?.ring).toHaveLength(65);
    }

    const tooSmall = await host.call('lobby:setBoundary', {
      boundary: { type: 'circle', center: HOME, radiusM: 20 },
    });
    expect(errorCode(tooSmall)).toBe('INVALID_PAYLOAD');
    if (!tooSmall.ok) expect(tooSmall.error.message).toMatch(/too small/i);
    expect(errorCode(await bea.call('lobby:setBoundary', { boundary: CIRCLE }))).toBe('NOT_HOST');
    // A malformed payload never reaches the engine.
    const bad = await host.call('lobby:setBoundary', {
      boundary: { type: 'polygon', coords: [[1, 2]] },
    } as never);
    expect(errorCode(bad)).toBe('INVALID_PAYLOAD');
  });

  it('Ready is refused without a good fix (WEAK_GPS), and works after one', async () => {
    const { clients } = await lobbyOf(['Host', 'Bea']);
    const [host] = clients as [TestClient, TestClient];
    expect(errorCode(await host.call('lobby:setReady', { ready: true }))).toBe('WEAK_GPS');
    await host.locate(ts.clock.now, HOME, DEFAULT_CONFIG.maxAccuracyM + 10);
    expect(errorCode(await host.call('lobby:setReady', { ready: true }))).toBe('WEAK_GPS');
    await host.locate(ts.clock.now, offsetByMeters(HOME, 2, 0), 8);
    await host.ok('lobby:setReady', { ready: true });
    const v = await host.waitForView((x) => x.me.ready, 'ready');
    expect(v.me.location?.quality).toBe('good');
  });

  it('a stale fix blocks Ready (STALE)', async () => {
    const { clients } = await lobbyOf(['Host', 'Bea']);
    const [host] = clients as [TestClient, TestClient];
    await host.locate(ts.clock.now);
    ts.clock.now += (DEFAULT_CONFIG.staleAfterS + 1) * 1000;
    expect(errorCode(await host.call('lobby:setReady', { ready: true }))).toBe('STALE');
  });

  it('a boundary change un-readies everyone and every client gets lobby.mapChanged', async () => {
    const { clients } = await lobbyOf(['Host', 'Bea']);
    const [host, bea] = clients as [TestClient, TestClient];
    for (const c of clients) await c.locate(ts.clock.now);
    await bea.ok('lobby:setReady', { ready: true });
    await host.ok('lobby:setBoundary', { boundary: CIRCLE });
    await bea.waitForView((v) => !v.me.ready && v.lobby.map.boundary !== undefined, 'un-readied');
    for (const c of clients) {
      await waitFor(() => c.events.some((e) => e.type === 'lobby.mapChanged'), 'mapChanged event');
    }
  });

  it('flags a player outside the boundary (display only)', async () => {
    const { clients } = await lobbyOf(['Host', 'Bea']);
    const [host, bea] = clients as [TestClient, TestClient];
    await host.ok('lobby:setBoundary', { boundary: CIRCLE });
    await bea.locate(ts.clock.now, offsetByMeters(HOME, 60, 0));
    expect(bea.view?.me.location?.oob).toBe(false);
    ts.clock.now += 20_000;
    await bea.locate(ts.clock.now, offsetByMeters(HOME, 200, 0)); // 7 m/s: plausible
    expect(bea.view?.me.location?.oob).toBe(true);
  });

  it('radar: each player gets anonymous dots for the others, once per second, with no ids or names', async () => {
    const { code, clients } = await lobbyOf(['Host', 'Bea', 'Cy']);
    const [host, bea, cy] = clients as [TestClient, TestClient, TestClient];
    await host.ok('lobby:setBoundary', { boundary: CIRCLE });
    await host.locate(ts.clock.now, HOME);
    await bea.locate(ts.clock.now, offsetByMeters(HOME, 20, 0));
    await cy.locate(ts.clock.now, offsetByMeters(HOME, 0, 200)); // outside the circle
    ts.clock.now += 1000;
    ts.server.rooms.get(code)?.tick();
    for (const c of clients) await waitFor(() => c.radars.at(-1), 'radar frame');

    const hostRadar = host.radars.at(-1);
    expect(hostRadar?.dots).toHaveLength(2);
    expect(hostRadar?.at).toBe(ts.clock.now);
    const cyDot = hostRadar?.dots.find((d) => d.flags.includes('oob'));
    expect(cyDot).toBeDefined();
    // Another viewer sees the same person under a different alias.
    const beaAliases = new Set(bea.radars.at(-1)?.dots.map((d) => d.alias));
    expect(beaAliases.has(cyDot?.alias ?? '')).toBe(false);

    // Nothing in any radar frame names a player.
    const ids = [host, bea, cy].map((c) => c.view?.me.id ?? '');
    for (const c of clients) {
      for (const frame of c.frames.filter((f) => f.startsWith('["radar"'))) {
        for (const id of ids) expect(frame).not.toContain(id);
        expect(frame).not.toMatch(/Host|Bea|Cy\b/);
      }
    }
  });

  it('radar goes out at most once per radarIntervalMs', async () => {
    const { code, clients } = await lobbyOf(['Host', 'Bea']);
    const [host] = clients as [TestClient, TestClient];
    const room = ts.server.rooms.get(code);
    ts.clock.now += 1000;
    room?.tick();
    room?.tick(); // same instant: no second frame
    await waitFor(() => host.radars.length >= 1, 'first frame');
    expect(host.radars).toHaveLength(1);
    ts.clock.now += 1000;
    room?.tick();
    await waitFor(() => host.radars.length === 2, 'second frame');
  });

  it('dev:teleport is refused outside test mode and works inside it', async () => {
    const { clients } = await lobbyOf(['Host', 'Bea']);
    const [host] = clients as [TestClient, TestClient];
    expect(errorCode(await host.call('dev:teleport', HOME))).toBe('NOT_ALLOWED');
    await host.ok('lobby:updateConfig', { patch: { testMode: true } });
    await host.ok('dev:teleport', HOME);
    const v = await host.waitForView((x) => x.me.location !== undefined, 'teleported');
    expect(v.me.location).toMatchObject({ ...HOME, accuracy: DEFAULT_CONFIG.teleportAccuracyM });
    expect(v.lobby.testMode).toBe(true);
  });

  it('loc:update is rate-limited on its own (drops extras silently) and ignores future stamps', async () => {
    const { clients } = await lobbyOf(['Host', 'Bea']);
    const [host] = clients as [TestClient, TestClient];
    const at = (i: number) => offsetByMeters(HOME, i, 0);
    for (let i = 1; i <= 10; i++) {
      host.socket.emit('loc:update', { ...at(i), accuracy: 5, ts: ts.clock.now });
    }
    await waitFor(() => host.view?.me.location, 'some fix stored');
    await new Promise((r) => setTimeout(r, 100));
    // Only the first `locEventsPerSecond` fixes got through.
    expect(host.view?.me.location?.lat).toBe(at(DEFAULT_CONFIG.locEventsPerSecond).lat);

    // A fix from the future is dropped even when the limiter allows it.
    await new Promise((r) => setTimeout(r, 1100));
    host.socket.emit('loc:update', {
      ...at(50),
      accuracy: 5,
      ts: ts.clock.now + (DEFAULT_CONFIG.futureFixToleranceS + 5) * 1000,
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(host.view?.me.location?.lat).toBe(at(DEFAULT_CONFIG.locEventsPerSecond).lat);
  });

  it('an invalid loc:update payload is ignored and does not crash the socket', async () => {
    const { clients } = await lobbyOf(['Host', 'Bea']);
    const [host] = clients as [TestClient, TestClient];
    host.socket.emit('loc:update', { lat: 999, lng: 0, accuracy: 1, ts: 1 });
    expect(errorCode(await host.call('time:ping', { clientTs: 1 }))).toBe('OK');
  });
});

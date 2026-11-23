/** Phase 3 over real sockets: the host's setup reaches every client, guests can't change it. */
import { offsetByMeters } from '@afterdark/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  errorCode,
  HOME,
  openClient,
  startTestServer,
  type TestClient,
  type TestServer,
} from './helpers';

const SAFE = { acceptedSafety: true } as const;
const CIRCLE = { type: 'circle', center: HOME, radiusM: 200 } as const;

describe('regions, task points, no-go zones and Base over sockets', () => {
  let ts: TestServer;
  const all: TestClient[] = [];
  const tokens = new Map<TestClient, string>();

  beforeEach(async () => {
    ts = await startTestServer();
  });
  afterEach(async () => {
    for (const c of all.splice(0)) c.close();
    await ts.close();
  });

  async function lobbyOf(n: number) {
    const clients: TestClient[] = [];
    let code = '';
    for (let i = 0; i < n; i++) {
      const c = await openClient(ts.url);
      all.push(c);
      if (i === 0) {
        const res = await c.ok('lobby:create', { username: 'Host', ...SAFE });
        code = res.code;
        tokens.set(c, res.token);
      } else {
        const res = await c.ok('lobby:join', { code, username: `Guest${i}`, ...SAFE });
        tokens.set(c, res.token);
      }
      clients.push(c);
    }
    return clients as [TestClient, TestClient, ...TestClient[]];
  }

  it('a boundary produces regions, points and a Base that every client sees identically', async () => {
    const [host, guest] = await lobbyOf(2);
    await host.ok('lobby:setBoundary', { boundary: CIRCLE });
    const hostView = await host.waitForView((v) => v.lobby.map.regions.length > 0, 'regions');
    const guestView = await guest.waitForView((v) => v.lobby.map.regions.length > 0, 'regions');
    expect(hostView.lobby.map.regions).toHaveLength(3);
    expect(guestView.lobby.map).toEqual(hostView.lobby.map);
    expect(hostView.lobby.map.taskPoints.length).toBeGreaterThan(20);
    expect(hostView.lobby.map.base).toBeDefined();
    expect(hostView.game?.regionCounts).toHaveLength(3);
  });

  it('the host renames a region, edits points, sets zones and the Base; guests get NOT_HOST', async () => {
    const [host, guest] = await lobbyOf(2);
    await host.ok('lobby:setBoundary', { boundary: CIRCLE });
    const v = await host.waitForView((x) => x.lobby.map.regions.length > 0, 'regions');
    const regionId = v.lobby.map.regions[0]?.id ?? '';
    const pointId = v.lobby.map.taskPoints[0]?.id ?? '';

    await host.ok('lobby:renameRegion', { regionId, name: 'Old Gym' });
    await host.ok('lobby:editTaskPoints', {
      remove: [pointId],
      add: [offsetByMeters(HOME, 10, 10)],
    });
    const zone = [
      offsetByMeters(HOME, -20, -250),
      offsetByMeters(HOME, 10, -250),
      offsetByMeters(HOME, 10, 250),
      offsetByMeters(HOME, -20, 250),
    ].map((p) => [p.lng, p.lat]);
    await host.ok('lobby:setNoGoZones', { zones: [zone] });
    const spot = offsetByMeters(HOME, 90, 60);
    await host.ok('lobby:setBase', spot);
    await host.ok('lobby:regenerateRegions', { regionCount: 4, seed: 7 });

    const after = await guest.waitForView(
      (x) => x.lobby.map.regions.length === 4 && x.lobby.map.noGo.length === 1,
      'new layout',
    );
    expect(after.lobby.config.regionCount).toBe(4);

    for (const call of [
      guest.call('lobby:renameRegion', { regionId, name: 'Nope' }),
      guest.call('lobby:editTaskPoints', { regenerate: true }),
      guest.call('lobby:setNoGoZones', { zones: [] }),
      guest.call('lobby:setBase', spot),
      guest.call('lobby:regenerateRegions', {}),
    ]) {
      expect(errorCode(await call)).toBe('NOT_HOST');
    }
  });

  it('reports a readable error for a Base or point outside the playable area', async () => {
    const [host] = await lobbyOf(2);
    await host.ok('lobby:setBoundary', { boundary: CIRCLE });
    const far = offsetByMeters(HOME, 900, 0);
    const base = await host.call('lobby:setBase', far);
    expect(errorCode(base)).toBe('INVALID_PAYLOAD');
    if (!base.ok) expect(base.error.message).toMatch(/inside the boundary/);
    expect(errorCode(await host.call('lobby:editTaskPoints', { add: [far] }))).toBe(
      'INVALID_PAYLOAD',
    );
    // Malformed payloads never reach the engine.
    expect(
      errorCode(await host.call('lobby:renameRegion', { regionId: 'r1', name: '<script>' })),
    ).toBe('INVALID_PAYLOAD');
    expect(errorCode(await host.call('lobby:setBase', { lat: 'x' } as never))).toBe(
      'INVALID_PAYLOAD',
    );
  });

  it('every setup change un-readies the guests and sends lobby.mapChanged', async () => {
    const [host, guest] = await lobbyOf(2);
    await host.ok('lobby:setBoundary', { boundary: CIRCLE });
    await guest.locate(ts.clock.now, HOME);
    await guest.ok('lobby:setReady', { ready: true });
    await guest.waitForView((v) => v.me.ready, 'ready');
    const before = guest.events.filter((e) => e.type === 'lobby.mapChanged').length;
    await host.ok('lobby:regenerateRegions', {});
    await guest.waitForView((v) => !v.me.ready, 'un-readied');
    expect(guest.events.filter((e) => e.type === 'lobby.mapChanged').length).toBeGreaterThan(
      before,
    );
  });

  it('no raw frame contains a session token or another player’s coordinates', async () => {
    const [host, guest] = await lobbyOf(3);
    await host.ok('lobby:setBoundary', { boundary: CIRCLE });
    await host.locate(ts.clock.now, offsetByMeters(HOME, 3.123456, 4.654321));
    await guest.waitForView((v) => v.lobby.map.regions.length > 0, 'regions');
    const hostFrames = host.frames.join('');
    const guestFrames = guest.frames.join('');
    expect(guestFrames).not.toContain('3.123456');
    expect(guestFrames).not.toContain('4.654321');
    expect(guestFrames).not.toContain(tokens.get(host) ?? '\u0000');
    expect(hostFrames).not.toContain(tokens.get(guest) ?? '\u0000');
  });
});

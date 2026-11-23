/**
 * Phase 1 happy path over real sockets (TESTING.md §2): 8 clients create,
 * join, ready up and get the countdown; reconnect, host hand-over, duplicate
 * names and a full lobby. Also scans every raw frame for session tokens.
 */
import { DEFAULT_CONFIG } from '@afterdark/shared';
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
const COUNTDOWN_MS = DEFAULT_CONFIG.startCountdownS * 1000;
/** Acceptance: roster changes reach every client within 500 ms locally. */
const PROPAGATION_BUDGET_MS = 500;

interface Member {
  client: TestClient;
  token: string;
  playerId: string;
  name: string;
}

describe('lobby: 8 players over sockets', () => {
  let ts: TestServer;
  const all: TestClient[] = [];
  const open = async () => {
    const c = await openClient(ts.url);
    all.push(c);
    return c;
  };

  beforeEach(async () => {
    ts = await startTestServer();
  });

  afterEach(async () => {
    for (const c of all.splice(0)) c.close();
    await ts.close();
  });

  async function lobbyOf(n: number): Promise<{ code: string; members: Member[] }> {
    const hostClient = await open();
    const created = await hostClient.ok('lobby:create', { username: 'Host', ...SAFE });
    const members: Member[] = [
      { client: hostClient, token: created.token, playerId: created.playerId, name: 'Host' },
    ];
    for (let i = 1; i < n; i++) {
      const client = await open();
      const name = `Player ${i}`;
      const res = await client.ok('lobby:join', { code: created.code, username: name, ...SAFE });
      members.push({ client, name, ...res });
    }
    return { code: created.code, members };
  }

  /** The host draws a circle and everyone sends a good fix, so all of them can ready up. */
  async function prepare(members: Member[]): Promise<void> {
    await members[0]?.client.ok('lobby:setBoundary', {
      boundary: { type: 'circle', center: HOME, radiusM: 120 },
    });
    for (const m of members) await m.client.locate(ts.clock.now);
  }

  const everyoneSees = (
    members: Member[],
    pred: Parameters<TestClient['waitForView']>[0],
    what: string,
  ) => Promise.all(members.map((m) => m.client.waitForView(pred, `${m.name}: ${what}`)));

  it('create → join ×7 → all ready → countdown → starting; reconnect keeps identity; host hands over', async () => {
    const { code, members } = await lobbyOf(8);
    const [host, ...guests] = members as [Member, ...Member[]];

    const t0 = Date.now();
    await everyoneSees(members, (v) => v.lobby.players.length === 8, 'full roster');
    expect(Date.now() - t0).toBeLessThan(PROPAGATION_BUDGET_MS);
    expect(host.client.view?.lobby.players.map((p) => p.username)).toEqual(
      members.map((m) => m.name),
    );

    // A duplicate name (case-insensitive) is rejected.
    const dup = await open();
    expect(errorCode(await dup.call('lobby:join', { code, username: 'player 3', ...SAFE }))).toBe(
      'NAME_TAKEN',
    );

    await prepare(members);
    // Everyone readies → countdown event + deadline in every view.
    for (const m of members) await m.client.ok('lobby:setReady', { ready: true });
    const endsAt = ts.clock.now + COUNTDOWN_MS;
    await everyoneSees(members, (v) => v.lobby.countdownEndsAt === endsAt, 'countdown');
    for (const m of members) {
      await waitFor(
        () => m.client.events.some((e) => e.type === 'lobby.countdown' && e.endsAt === endsAt),
        `${m.name}: countdown event`,
      );
    }

    // One player drops and comes back: same id, still in the roster.
    const dropper = guests[2] as Member;
    dropper.client.close();
    await host.client.waitForView(
      (v) => v.lobby.players.find((p) => p.id === dropper.playerId)?.connected === false,
      'dropper offline',
    );
    // Dropping un-readied them, which cancelled the countdown.
    expect(host.client.view?.lobby.countdownEndsAt).toBeUndefined();
    const back = await open();
    expect(await back.ok('session:resume', { token: dropper.token })).toEqual({
      playerId: dropper.playerId,
      code,
    });
    const backView = await back.waitForView((v) => v.me.id === dropper.playerId, 'resumed view');
    expect(backView.me.username).toBe(dropper.name);
    dropper.client = back;
    await back.ok('lobby:setReady', { ready: true });

    // Countdown restarts and expires on the next tick → placeholder `starting` phase.
    await everyoneSees(members, (v) => v.lobby.countdownEndsAt !== undefined, 'countdown again');
    ts.clock.now += COUNTDOWN_MS;
    ts.server.rooms.get(code)?.tick();
    await everyoneSees(members, (v) => v.lobby.phase === 'starting', 'starting');
    const late = await open();
    expect(errorCode(await late.call('lobby:join', { code, username: 'Late', ...SAFE }))).toBe(
      'GAME_IN_PROGRESS',
    );

    // The host leaves: host status moves to the earliest-joined connected player.
    await host.client.ok('lobby:leave', {});
    const next = guests[0] as Member;
    await next.client.waitForView(
      (v) => v.lobby.hostId === next.playerId && v.me.isHost,
      'new host',
    );

    // Raw frame scan: no client ever received anyone's session token.
    const tokens = members.map((m) => m.token);
    for (const c of all) {
      for (const frame of c.frames) for (const t of tokens) expect(frame).not.toContain(t);
    }
  });

  it(`a ${DEFAULT_CONFIG.maxPlayers + 1}th player gets LOBBY_FULL`, async () => {
    const { code } = await lobbyOf(DEFAULT_CONFIG.maxPlayers);
    const extra = await open();
    expect(errorCode(await extra.call('lobby:join', { code, username: 'Thirteen', ...SAFE }))).toBe(
      'LOBBY_FULL',
    );
  });

  it('a config change un-readies everyone and reaches every client', async () => {
    const { members } = await lobbyOf(4);
    await prepare(members);
    for (const m of members) await m.client.ok('lobby:setReady', { ready: true });
    await everyoneSees(members, (v) => v.lobby.countdownEndsAt !== undefined, 'countdown');
    await members[0]?.client.ok('lobby:updateConfig', { patch: { playTimeMin: 15 } });
    await everyoneSees(
      members,
      (v) => v.lobby.config.playTimeMin === 15 && v.lobby.players.every((p) => !p.ready),
      'config applied, all un-ready',
    );
    expect(members[1]?.client.view?.lobby.countdownEndsAt).toBeUndefined();
    expect(
      errorCode(
        (await members[1]?.client.call('lobby:updateConfig', { patch: { playTimeMin: 20 } }))!,
      ),
    ).toBe('NOT_HOST');
  });

  it('the host hands over after being disconnected for hostDisconnectGraceS', async () => {
    const { code, members } = await lobbyOf(3);
    const [host, second] = members as [Member, Member];
    host.client.close();
    await second.client.waitForView((v) => v.lobby.players[0]?.connected === false, 'host offline');
    ts.clock.now += DEFAULT_CONFIG.hostDisconnectGraceS * 1000;
    ts.server.rooms.get(code)?.tick();
    await second.client.waitForView((v) => v.me.isHost, 'second is host');
  });
});

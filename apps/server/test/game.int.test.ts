/**
 * Phase 4 over real sockets (TESTING.md §2): 8 clients play lobby → spawn →
 * reveal → playing, then pause, resume, reconnect and abort. A raw-frame scan
 * checks that no crew socket ever receives another player's tag or role, and
 * a second scenario reaches play with 1 human and 7 in-process bots.
 */
import { DEFAULT_CONFIG, type PlayerView } from '@afterdark/shared';
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
const S = 1000;

interface Member {
  client: TestClient;
  token: string;
  playerId: string;
  name: string;
}

describe('game start flow over sockets', () => {
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

  const tick = (code: string, advanceS = 0) => {
    ts.clock.now += advanceS * S;
    ts.server.rooms.get(code)?.tick();
  };

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

  /** Test mode on, a 250 m boundary, everyone located and ready: the countdown is running. */
  async function readyUp(members: Member[]): Promise<void> {
    const host = members[0]?.client;
    await host?.ok('lobby:updateConfig', { patch: { testMode: true, coopChance: 0 } });
    await host?.ok('lobby:setBoundary', {
      boundary: { type: 'circle', center: HOME, radiusM: 250 },
    });
    for (const m of members) await m.client.locate(ts.clock.now);
    for (const m of members) await m.client.ok('lobby:setReady', { ready: true });
  }

  const everyoneSees = (
    members: Member[],
    pred: (v: PlayerView) => boolean,
    what: string,
  ): Promise<PlayerView[]> =>
    Promise.all(members.map((m) => m.client.waitForView(pred, `${m.name}: ${what}`)));

  /** Everyone teleports onto their own spawn (the same command a bot uses). */
  async function walkToSpawns(members: Member[]): Promise<void> {
    for (const m of members) {
      const spawn = m.client.view?.me.spawn;
      if (!spawn) throw new Error(`${m.name} has no spawn`);
      await m.client.ok('dev:teleport', { lat: spawn.lat, lng: spawn.lng });
    }
  }

  it('lobby → spawning → reveal → playing, with roles seen only by their owners', async () => {
    const { code, members } = await lobbyOf(8);
    await readyUp(members);
    tick(code, DEFAULT_CONFIG.startCountdownS);

    // Spawning: each player has only their own spawn and no role yet.
    const spawning = await everyoneSees(members, (v) => v.lobby.phase === 'spawning', 'spawning');
    expect(new Set(spawning.map((v) => `${v.me.spawn?.lat},${v.me.spawn?.lng}`)).size).toBe(8);
    for (const v of spawning) {
      expect(v.me.role).toBeUndefined();
      expect(v.game?.spawn?.total).toBe(8);
    }

    // Walking in: the counter climbs and the last arrival reveals the roles.
    const first = members[1];
    const spawn = first?.client.view?.me.spawn;
    await first?.client.ok('dev:teleport', { lat: spawn?.lat ?? 0, lng: spawn?.lng ?? 0 });
    await members[0]?.client.waitForView((v) => v.game?.spawn?.reached === 1, 'x/y counter');
    await walkToSpawns(members);
    const revealed = await everyoneSees(members, (v) => v.lobby.phase === 'reveal', 'reveal');

    // Exactly 2 imposters (8 players), unique tags, allies visible to imposters only.
    const imposters = revealed.filter((v) => v.me.role === 'imposter');
    const crew = revealed.filter((v) => v.me.role === 'crew');
    expect(imposters).toHaveLength(2);
    expect(crew).toHaveLength(6);
    expect(new Set(revealed.map((v) => v.me.tag)).size).toBe(8);
    for (const v of imposters) {
      const other = imposters.find((o) => o.me.id !== v.me.id);
      expect(v.me.imposter?.allies).toEqual([
        {
          playerId: other?.me.id,
          username: other?.me.username,
          tag: other?.me.tag,
          classes: other?.me.imposter?.classes,
          abilities: other?.me.imposter?.abilities,
        },
      ]);
      expect(v.me.imposter?.classes).toHaveLength(1);
    }
    for (const v of crew) {
      expect('imposter' in v.me).toBe(false);
      expect(v.game?.crewCount).toBe(6);
      expect(v.game?.threshold).toBe(4);
    }
    expect(revealed[0]?.game?.revealEndsAt).toBeDefined();

    // Play begins when the reveal runs out; the clock starts.
    for (const m of members) await m.client.locate(ts.clock.now, m.client.view?.me.spawn);
    tick(code, DEFAULT_CONFIG.roleRevealS);
    const playing = await everyoneSees(members, (v) => v.lobby.phase === 'playing', 'playing');
    for (const v of playing) {
      expect(v.game?.clock?.endsAt).toBe(ts.clock.now + DEFAULT_CONFIG.playTimeMin * 60 * S);
      expect(v.game?.clock?.pausedAt).toBeUndefined();
      expect(v.me.zone).toEqual({ oob: false });
      expect(v.game?.teamScore).toBe(0);
      expect(v.game?.compromised).toBe(0);
    }

    // The raw frames: a crew socket never receives another player's tag, and never a role key.
    const tags = revealed.map((v) => v.me.tag ?? '');
    for (const m of members) {
      const mine = m.client.view;
      const frames = m.client.frames.join('\n');
      expect(frames).not.toContain('"token"');
      if (mine?.me.role === 'crew') {
        for (const tag of tags.filter((t) => t !== mine.me.tag)) expect(frames).not.toContain(tag);
        expect(frames).not.toContain('"imposter":');
        expect(frames).not.toContain('"allies":');
        expect(frames).not.toContain('"classes":'); // as a key (the config value "classes" is public)
        expect(frames).not.toMatch(/"role":"imposter"/);
      } else {
        for (const c of crew) expect(frames).not.toContain(c.me.tag ?? '#');
      }
    }
  });

  async function toPlaying(n: number) {
    const { code, members } = await lobbyOf(n);
    await readyUp(members);
    tick(code, DEFAULT_CONFIG.startCountdownS);
    await everyoneSees(members, (v) => v.lobby.phase === 'spawning', 'spawning');
    await walkToSpawns(members);
    await everyoneSees(members, (v) => v.lobby.phase === 'reveal', 'reveal');
    for (const m of members) await m.client.locate(ts.clock.now, m.client.view?.me.spawn);
    tick(code, DEFAULT_CONFIG.roleRevealS);
    await everyoneSees(members, (v) => v.lobby.phase === 'playing', 'playing');
    return { code, members };
  }

  it('pausing freezes the timer on every client; a non-host cannot; actions are PAUSED; resume restarts it', async () => {
    const { code, members } = await toPlaying(5);
    const [host, other] = members;
    expect(
      errorCode((await other?.client.call('game:pause', {})) ?? { ok: true, data: undefined }),
    ).toBe('NOT_HOST');

    tick(code, 20);
    await host?.client.ok('game:pause', {});
    const frozen = await everyoneSees(
      members,
      (v) => v.game?.clock?.pausedAt !== undefined,
      'paused',
    );
    const endsAt = frozen[0]?.game?.clock?.endsAt;
    const pausedAt = frozen[0]?.game?.clock?.pausedAt;
    for (const v of frozen) {
      expect(v.game?.clock).toEqual({ endsAt, pausedAt }); // identical on every client
    }
    expect(host?.client.events.some((e) => e.type === 'game.paused')).toBe(true);

    tick(code, 600); // ten real minutes pass
    expect(host?.client.view?.game?.clock).toEqual({ endsAt, pausedAt });
    expect(
      errorCode(
        (await other?.client.call('lobby:setReady', { ready: true })) ?? {
          ok: true,
          data: undefined,
        },
      ),
    ).toBe('PAUSED');

    await host?.client.ok('game:resume', {});
    const running = await everyoneSees(
      members,
      (v) => v.game?.clock?.pausedAt === undefined,
      'resumed',
    );
    expect(running[0]?.game?.clock?.endsAt).toBe((endsAt ?? 0) + 600 * S);
  });

  it('reconnecting during the game restores the role view', async () => {
    const { code, members } = await toPlaying(5);
    const victim = members[2] as Member;
    const before = victim.client.view;
    victim.client.close();
    await members[0]?.client.waitForView(
      (v) => v.lobby.players.find((p) => p.id === victim.playerId)?.connected === false,
      'victim offline',
    );
    const back = await open();
    await back.ok('session:resume', { token: victim.token });
    const view = await back.waitForView((v) => v.me.id === victim.playerId, 'resumed view');
    expect(view.me.role).toBe(before?.me.role);
    expect(view.me.tag).toBe(before?.me.tag);
    expect(view.me.imposter).toEqual(before?.me.imposter);
    expect(view.lobby.phase).toBe('playing');
    expect(ts.server.rooms.get(code)?.state.phase).toBe('playing');
  });

  it('abort ends the game for everyone with no winner', async () => {
    const { members } = await toPlaying(5);
    await members[0]?.client.ok('game:abort', {});
    const ended = await everyoneSees(members, (v) => v.lobby.phase === 'ended', 'ended');
    for (const v of ended) expect(v.game?.result).toEqual({ winner: null, reason: 'abort' });
    expect(members[1]?.client.events).toContainEqual({
      type: 'game.ended',
      winner: null,
      reason: 'abort',
    });
  });

  it('force start works from the spawn phase and only for the host', async () => {
    const { code, members } = await lobbyOf(5);
    await readyUp(members);
    tick(code, DEFAULT_CONFIG.startCountdownS);
    await everyoneSees(members, (v) => v.lobby.phase === 'spawning', 'spawning');
    expect(
      errorCode(
        (await members[1]?.client.call('game:forceStart', {})) ?? { ok: true, data: undefined },
      ),
    ).toBe('NOT_HOST');
    await members[0]?.client.ok('game:forceStart', {});
    await everyoneSees(members, (v) => v.lobby.phase === 'reveal', 'reveal');
  });

  it('dev events are refused outside test mode', async () => {
    const { members } = await lobbyOf(2);
    const res = await members[0]?.client.call('dev:addBots', { count: 2 });
    expect(res && errorCode(res)).toBe('NOT_ALLOWED');
  });
});

describe('1 human + 7 bots reach play (acceptance)', () => {
  let ts: TestServer;
  let human: TestClient;
  beforeEach(async () => {
    ts = await startTestServer();
    human = await openClient(ts.url);
  });
  afterEach(async () => {
    human.close();
    await ts.close();
  });

  it('bots join, ready up, the host force-starts and the match begins', async () => {
    const created = await human.ok('lobby:create', { username: 'Human', ...SAFE });
    const room = ts.server.rooms.get(created.code);
    const tick = (s = 1) => {
      ts.clock.now += s * S;
      room?.tick();
    };
    await human.ok('lobby:updateConfig', { patch: { testMode: true, coopChance: 0 } });
    await human.ok('lobby:setBoundary', {
      boundary: { type: 'circle', center: HOME, radiusM: 250 },
    });
    await human.ok('dev:addBots', { count: 7 });
    await human.waitForView((v) => v.lobby.players.length === 8, '8 players');

    // The bots send a fix and ready up on their first ticks.
    await human.locate(ts.clock.now);
    tick();
    tick();
    await human.waitForView(
      (v) => v.lobby.players.filter((p) => p.id !== v.me.id).every((p) => p.ready),
      'bots ready',
    );
    await human.ok('lobby:setReady', { ready: true });
    tick(DEFAULT_CONFIG.startCountdownS);
    await human.waitForView((v) => v.lobby.phase === 'spawning', 'spawning');

    // Bots start walking (1.4 m/s); the host does not wait.
    for (let i = 0; i < 3; i++) {
      tick();
      await human.locate(ts.clock.now, human.view?.me.location ?? HOME);
    }
    await human.ok('game:forceStart', {});
    const reveal = await human.waitForView((v) => v.lobby.phase === 'reveal', 'reveal');
    expect(reveal.me.role).toBeDefined();
    expect(reveal.game?.crewCount).toBe(6);
    tick(DEFAULT_CONFIG.roleRevealS);
    const playing = await human.waitForView((v) => v.lobby.phase === 'playing', 'playing');
    expect(playing.game?.clock).toBeDefined();
    expect(room?.state.players.filter((p) => p.role === 'imposter')).toHaveLength(2);
    expect(room?.state.players.filter((p) => p.bot)).toHaveLength(7);
    await waitFor(() => human.radars.length > 0, 'a radar frame');
  });
});

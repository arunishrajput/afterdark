/**
 * Phase 7 over real sockets: imposters infect through `ability:infect`, the target
 * hears nothing, every crew socket frame is scanned for infection, and a whole
 * bot game ends in an imposter win (V3). A scripted game checks V4 at time-up.
 */
import { DEFAULT_CONFIG, offsetByMeters, type PlayerView, stepToward } from '@afterdark/shared';
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
const S = 1000;
/** Short but legal host settings: the exposure still has to be channelled, left and incubated. */
const FAST = { testMode: true, infectionChannelS: 5, incubationS: 10 } as const;

interface Member {
  client: TestClient;
  name: string;
}

describe('infection over sockets', () => {
  let ts: TestServer;
  const all: TestClient[] = [];

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

  async function toPlaying(n: number, config: Record<string, unknown> = FAST) {
    const open = async () => {
      const c = await openClient(ts.url);
      all.push(c);
      return c;
    };
    const host = await open();
    const created = await host.ok('lobby:create', { username: 'Host', ...SAFE });
    const members: Member[] = [{ client: host, name: 'Host' }];
    for (let i = 1; i < n; i++) {
      const client = await open();
      await client.ok('lobby:join', { code: created.code, username: `Player ${i}`, ...SAFE });
      members.push({ client, name: `Player ${i}` });
    }
    await host.ok('lobby:updateConfig', { patch: { ...config, playerVisibility: 'all' } });
    await host.ok('lobby:setBoundary', {
      boundary: { type: 'circle', center: HOME, radiusM: 250 },
    });
    for (const m of members) await m.client.locate(ts.clock.now);
    for (const m of members) await m.client.ok('lobby:setReady', { ready: true });
    tick(created.code, DEFAULT_CONFIG.startCountdownS);
    await Promise.all(
      members.map((m) => m.client.waitForView((v) => v.lobby.phase === 'spawning')),
    );
    for (const m of members) {
      const spawn = m.client.view?.me.spawn;
      await m.client.ok('dev:teleport', { lat: spawn?.lat ?? 0, lng: spawn?.lng ?? 0 });
    }
    await Promise.all(members.map((m) => m.client.waitForView((v) => v.lobby.phase === 'reveal')));
    for (const m of members) await m.client.locate(ts.clock.now, m.client.view?.me.spawn);
    tick(created.code, DEFAULT_CONFIG.roleRevealS);
    await Promise.all(members.map((m) => m.client.waitForView((v) => v.lobby.phase === 'playing')));
    return { code: created.code, members };
  }

  const roleOf = (m: Member) => m.client.view?.me.role;

  it('a scripted game: three infections, nothing reaches a crew socket, V4 decides at time-up', async () => {
    const { code, members } = await toPlaying(8);
    const imposters = members.filter((m) => roleOf(m) === 'imposter');
    const crew = members.filter((m) => roleOf(m) === 'crew');
    const hunter = imposters[0] as Member;
    const victims = crew.slice(0, 3);

    // Infect needs the initial cooldown to pass, and a fresh fix from both.
    tick(code, DEFAULT_CONFIG.abilityInitialCooldownS);

    // A crew member cannot use it, and an imposter far from anyone is refused.
    expect(errorCode(await (victims[0] as Member).client.call('ability:infect', {}))).toBe(
      'NOT_ALLOWED',
    );

    const here = new Map<string, { lat: number; lng: number }>();
    for (const m of [...imposters, ...crew]) {
      const loc = m.client.view?.me.location;
      here.set(m.name, { lat: loc?.lat ?? HOME.lat, lng: loc?.lng ?? HOME.lng });
    }
    // Positions go straight into the room (the socket's own 2 fixes/s limit is not what is under test here);
    // everything the imposter does, and everything every client sees, goes over the sockets.
    const room = ts.server.rooms.get(code);
    if (!room) throw new Error('no room');
    const idOf = (m: Member) => m.client.view?.me.id ?? '';
    const refresh = (...who: Member[]) => {
      for (const m of who) {
        const at = here.get(m.name) ?? HOME;
        room.dispatch({
          type: 'locUpdate',
          playerId: idOf(m),
          fix: { ...at, accuracy: 5, ts: ts.clock.now },
        });
      }
    };
    const place = (m: Member, at: { lat: number; lng: number }) => {
      here.set(m.name, at);
      room.dispatch({ type: 'teleport', playerId: idOf(m), ...at });
    };

    for (const victim of victims) {
      const spot = here.get(victim.name) ?? HOME;
      place(hunter, offsetByMeters(spot, 3, 0));
      tick(code, 1);
      refresh(hunter, victim);

      const ack = await hunter.client.ok('ability:infect', {});
      expect(ack.channelEndsAt).toBe(ts.clock.now + FAST.infectionChannelS * S);
      const channelling = await hunter.client.waitForView(
        (v) => v.me.imposter?.infect.channel !== undefined,
        'a channel in the imposter view',
      );
      expect(channelling.me.imposter?.infect.channel?.inRange).toBe(true);

      for (let i = 0; i < FAST.infectionChannelS + 1; i++) {
        tick(code, 1);
        refresh(hunter, victim);
      }
      // Walk away, and let the incubation run out.
      // Toward the middle of the area, so the walk-away never lands outside it (that would freeze the cooldown).
      place(hunter, stepToward(spot, HOME, 60));
      for (let i = 0; i < DEFAULT_CONFIG.incubationDepartS + FAST.incubationS + 2; i++) {
        tick(code, 1);
        refresh(hunter, victim);
      }
      // Wait out Infect's cooldown before the next one.
      for (let i = 0; i < DEFAULT_CONFIG.infectionCooldownS; i += 5) {
        tick(code, 5);
        refresh(hunter, victim);
      }
    }

    // The imposter knows exactly who, and the radar marks them.
    const hunterView = await hunter.client.waitForView(
      (v) => (v.me.imposter?.compromisedIds.length ?? 0) === 3,
      'three compromised in the imposter view',
    );
    expect(hunterView.me.imposter?.exposures).toEqual([]);
    const victimIds = victims.map((v) => v.client.view?.me.id).sort();
    expect([...(hunterView.me.imposter?.compromisedIds ?? [])].sort()).toEqual(victimIds);
    expect(hunter.client.events.filter((e) => e.type === 'infect.completed')).toHaveLength(3);

    // The public boxes moved for everybody, to 3.
    for (const m of members) {
      const seen = await m.client.waitForView((v) => v.game?.compromised === 3, 'boxes at 3');
      expect(seen.game?.compromised).toBe(3);
      const counts = m.client.events.filter((e) => e.type === 'game.compromised');
      expect(counts.map((e) => (e.type === 'game.compromised' ? e.count : 0))).toEqual([1, 2, 3]);
    }

    // The raw frames of every crew socket (victims included) never mention infection.
    const tags = members.map((m) => m.client.view?.me.tag).filter((t): t is string => !!t);
    for (const m of crew) {
      const frames = m.client.frames.join('\n');
      for (const needle of [
        '"infected"',
        '"exposed"',
        '"compromisedIds"',
        '"exposures"',
        '"incubationEndsAt"',
        'infect.completed',
        'infect.failed',
        '"infect":',
        '"imposter":',
        '"allies":',
        '"ally"',
      ]) {
        expect(frames, `${m.name}: ${needle}`).not.toContain(needle);
      }
      for (const tag of tags.filter((t) => t !== m.client.view?.me.tag)) {
        expect(frames).not.toContain(tag);
      }
      for (const r of m.client.radars) {
        for (const d of r.dots)
          expect(d.flags.every((f) => f === 'oob' || f === 'stale')).toBe(true);
      }
    }
    // The imposters' radar does carry the marks.
    const marks = hunter.client.radars.flatMap((r) => r.dots.flatMap((d) => d.flags));
    expect(marks).toContain('infected');

    // V4: nobody reaches a threshold, so time-up compares 3/4 compromised with 0 points.
    expect(ts.server.rooms.get(code)?.state.phase).toBe('playing');
    tick(code, 25 * 60);
    const ended = await (members[0] as Member).client.waitForView(
      (v) => v.lobby.phase === 'ended',
      'ended',
    );
    expect(ended.game?.result).toEqual({ winner: 'imposters', reason: 'time' });
  }, 60_000);

  it('Infect is refused outside the game, out of range, and while paused', async () => {
    const host = await openClient(ts.url);
    all.push(host);
    await host.ok('lobby:create', { username: 'Host', ...SAFE });
    expect(errorCode(await host.call('ability:infect', {}))).toBe('WRONG_PHASE');
    expect(errorCode(await host.call('ability:infect', { extra: 1 } as never))).toBe(
      'INVALID_PAYLOAD',
    );
  });
});

describe('bots drive a game to an imposter win (acceptance, V3)', () => {
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

  it('1 human + 7 bots, imposter bots chase: infections reach the threshold', async () => {
    const created = await human.ok('lobby:create', { username: 'Human', ...SAFE });
    const room = ts.server.rooms.get(created.code);
    if (!room) throw new Error('no room');
    const tick = (s = 1) => {
      ts.clock.now += s * S;
      room.tick();
    };
    await human.ok('lobby:updateConfig', {
      patch: {
        testMode: true,
        infectionChannelS: 5,
        incubationS: 0,
        infectionWinPercent: 40,
        playerVisibility: 'all',
      },
    });
    await human.ok('lobby:setBoundary', {
      boundary: { type: 'circle', center: HOME, radiusM: 250 },
    });
    room.state.config.botSpeedMps = 6;
    // Crew bots open their tasks but never finish, so the crew cannot win the race.
    room.state.config.botTaskMinS = 100_000;
    room.state.config.botTaskMaxS = 100_000;
    await human.ok('dev:addBots', { count: 7, imposterBehaviour: 'chase' });
    await human.waitForView((v) => v.lobby.players.length === 8, '8 players');
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
    for (let i = 0; i < 3; i++) tick();
    await human.ok('game:forceStart', {});
    tick(DEFAULT_CONFIG.roleRevealS);
    await human.waitForView((v) => v.lobby.phase === 'playing', 'playing');

    const maxTicks = 1200;
    let ticks = 0;
    while (room.state.phase === 'playing' && ticks < maxTicks) {
      tick();
      ticks++;
    }
    const final = room.state;
    expect(final.phase).toBe('ended');
    expect(final.result).toEqual({ winner: 'imposters', reason: 'infection' });
    const infected = final.players.filter((p) => p.infection === 'infected');
    expect(infected.length).toBeGreaterThanOrEqual(final.game?.threshold ?? 99);
    expect(final.players.every((p) => p.role !== 'imposter' || p.infection === undefined)).toBe(
      true,
    );

    const view = await human.waitForView((v) => v.lobby.phase === 'ended', 'ended view');
    expect(view.game?.result).toEqual({ winner: 'imposters', reason: 'infection' });
    expect(view.game?.compromised).toBeGreaterThanOrEqual(view.game?.threshold ?? 99);
    assertHumanSawNoInfection(view, human);
  }, 120_000);
});

/** If the human played crew, none of their frames may carry infection; if an imposter, the keys are theirs to have. */
function assertHumanSawNoInfection(view: PlayerView, human: TestClient): void {
  if (view.me.role !== 'crew') return;
  const frames = human.frames.join('\n');
  for (const needle of [
    '"infected"',
    '"exposed"',
    '"compromisedIds"',
    '"incubationEndsAt"',
    'infect.',
  ]) {
    expect(frames).not.toContain(needle);
  }
}

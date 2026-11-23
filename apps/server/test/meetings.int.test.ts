/**
 * Phase 8 over real sockets: eight clients call a meeting, gather at the Base, skip the
 * discussion, vote and see the result. Covers an ejection with the right reveal, a
 * meeting with no ejection, ejecting the last imposter (V2), and a chain of wrong
 * ejections that ends in an imposter win (V3). Every crew socket frame is scanned for
 * attributed votes.
 */
import { DEFAULT_CONFIG, type MeetingStage, type PlayerView } from '@afterdark/shared';
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
const CFG = DEFAULT_CONFIG;

interface Member {
  client: TestClient;
  name: string;
}

describe('meetings over sockets', () => {
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

  async function toPlaying(n = 8) {
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
    await host.ok('lobby:updateConfig', { patch: { testMode: true, coopChance: 0, playerVisibility: 'all' } });
    await host.ok('lobby:setBoundary', {
      boundary: { type: 'circle', center: HOME, radiusM: 250 },
    });
    for (const m of members) await m.client.locate(ts.clock.now);
    for (const m of members) await m.client.ok('lobby:setReady', { ready: true });
    tick(created.code, CFG.startCountdownS);
    await Promise.all(
      members.map((m) => m.client.waitForView((v) => v.lobby.phase === 'spawning')),
    );
    for (const m of members) {
      const spawn = m.client.view?.me.spawn;
      await m.client.ok('dev:teleport', { lat: spawn?.lat ?? 0, lng: spawn?.lng ?? 0 });
    }
    await Promise.all(members.map((m) => m.client.waitForView((v) => v.lobby.phase === 'reveal')));
    for (const m of members) await m.client.locate(ts.clock.now, m.client.view?.me.spawn);
    tick(created.code, CFG.roleRevealS);
    await Promise.all(members.map((m) => m.client.waitForView((v) => v.lobby.phase === 'playing')));
    return { code: created.code, members };
  }

  const idOf = (m: Member) => m.client.view?.me.id ?? '';
  const roleOf = (m: Member) => m.client.view?.me.role;
  const waitStage = (members: Member[], stage: MeetingStage | undefined) =>
    Promise.all(
      members.map((m) =>
        m.client.waitForView(
          (v) => v.game?.meeting?.stage === stage,
          `${m.name} sees meeting stage ${stage}`,
        ),
      ),
    );

  /** Runs one whole meeting. `target` is voted for by everyone else (the target skips); `null` is everyone skipping. */
  async function runMeeting(
    code: string,
    members: Member[],
    caller: Member,
    target: Member | null,
  ): Promise<void> {
    const host = members[0] as Member;
    const live = members.filter((m) => m.client.view?.me.status === 'active');
    await host.client.ok('dev:advanceClock', {
      seconds: CFG.meetingStartGraceS + CFG.meetingCooldownS + 5,
    });
    // Fixes are fresh on the sockets' clock: refresh them before the call.
    const room = ts.server.rooms.get(code);
    for (const m of live) {
      const at = m.client.view?.me.location;
      room?.dispatch({
        type: 'locUpdate',
        playerId: idOf(m),
        fix: { lat: at?.lat ?? HOME.lat, lng: at?.lng ?? HOME.lng, accuracy: 5, ts: ts.clock.now },
      });
    }
    await caller.client.ok('meeting:call', {});
    // When everyone is already at the Base (a second meeting) Gather ends at once.
    await Promise.all(
      members.map((m) =>
        m.client.waitForView(
          (v) => v.game?.meeting?.stage === 'gather' || v.game?.meeting?.stage === 'discuss',
          'the meeting to start',
        ),
      ),
    );

    const base = host.client.view?.lobby.map.base;
    for (const m of live)
      await m.client.ok('dev:teleport', { lat: base?.lat ?? 0, lng: base?.lng ?? 0 });
    await waitStage(members, 'discuss');
    for (const m of live) await m.client.ok('meeting:skipDiscussion', {});
    await waitStage(members, 'vote');
    for (const m of live) {
      const pick = target && m !== target ? idOf(target) : 'skip';
      await m.client.ok('meeting:vote', { target: pick });
    }
    await waitStage(members, 'result');
    tick(code, CFG.meetingResultS + 1);
  }

  const frameLeaks = (m: Member) =>
    m.client.frames.filter((f) => /"votes"|"voter"|"votedFor"/.test(f));

  it('ejects an imposter by majority, reveals Imposter to everyone, and strips their imposter view', async () => {
    const { code, members } = await toPlaying();
    const imposters = members.filter((m) => roleOf(m) === 'imposter');
    const crew = members.filter((m) => roleOf(m) === 'crew');
    const target = imposters[0] as Member;
    await runMeeting(code, members, crew[0] as Member, target);

    for (const m of members) {
      const view = m.client.view as PlayerView;
      expect(view.lobby.players.find((p) => p.id === idOf(target))).toMatchObject({
        status: 'spectator',
        revealedRole: 'imposter',
      });
      expect(
        view.lobby.players.filter((p) => p.revealedRole !== undefined).map((p) => p.id),
      ).toEqual([idOf(target)]);
      const result = m.client.events.find((e) => e.type === 'meeting.result');
      expect(result).toEqual({
        type: 'meeting.result',
        ejected: { username: target.name, wasImposter: true },
      });
    }
    expect(target.client.view?.me.status).toBe('spectator');
    expect(target.client.view?.me.imposter).toBeUndefined();
    // The meeting is over and game time runs again; V2 only if it was the only imposter.
    if (imposters.length > 1) {
      await Promise.all(
        members.map((m) => m.client.waitForView((v) => v.game?.meeting === undefined)),
      );
      expect(members[0]?.client.view?.lobby.phase).toBe('playing');
    }
    for (const m of crew) expect(frameLeaks(m)).toEqual([]);
  });

  it('a meeting where everyone skips ejects nobody', async () => {
    const { code, members } = await toPlaying();
    await runMeeting(code, members, members[2] as Member, null);
    for (const m of members) {
      expect(m.client.events.find((e) => e.type === 'meeting.result')).toEqual({
        type: 'meeting.result',
      });
      expect(m.client.view?.me.status).toBe('active');
      expect(m.client.view?.lobby.players.every((p) => p.revealedRole === undefined)).toBe(true);
    }
    // The call allowance is spent: the caller cannot call again.
    const again = await (members[2] as Member).client.call('meeting:call', {});
    expect(errorCode(again)).toBe('NOT_ALLOWED');
  });

  it('refuses a meeting too early, and meeting commands from the wrong stage', async () => {
    const { members } = await toPlaying();
    const [a, b] = members as [Member, Member];
    expect(errorCode(await a.client.call('meeting:call', {}))).toBe('COOLDOWN');
    expect(errorCode(await b.client.call('meeting:vote', { target: 'skip' }))).toBe('WRONG_PHASE');
    expect(errorCode(await b.client.call('meeting:skipDiscussion', {}))).toBe('WRONG_PHASE');
    // Malformed payloads are rejected before any logic.
    const bad = await b.client.call('meeting:vote', { target: 'x' });
    expect(errorCode(bad)).toBe('INVALID_PAYLOAD');
  });

  it('ejecting every imposter ends the game: crew win by V2', async () => {
    const { code, members } = await toPlaying();
    const imposters = members.filter((m) => roleOf(m) === 'imposter');
    const crew = members.filter((m) => roleOf(m) === 'crew');
    let callerNo = 0;
    for (const imp of imposters) {
      await runMeeting(code, members, crew[callerNo++] as Member, imp);
    }
    await Promise.all(members.map((m) => m.client.waitForView((v) => v.lobby.phase === 'ended')));
    for (const m of members) {
      expect(m.client.view?.game?.result).toEqual({ winner: 'crew', reason: 'ejection' });
    }
  });

  it('wrongly ejecting crew raises the compromised count, and enough of them hand the imposters V3', async () => {
    const { code, members } = await toPlaying();
    const crew = members.filter((m) => roleOf(m) === 'crew');
    const threshold = members[0]?.client.view?.game?.threshold ?? 99;
    // Callers are never ejected: the crew members after the first `threshold`, then the imposters (each may call once).
    const callers = [...crew.slice(threshold), ...members.filter((m) => roleOf(m) === 'imposter')];
    expect(callers.length).toBeGreaterThanOrEqual(threshold);
    for (let i = 0; i < threshold; i++) {
      await runMeeting(code, members, callers[i] as Member, crew[i] as Member);
      const target = crew[i] as Member;
      if (i < threshold - 1) {
        await Promise.all(
          members.map((m) => m.client.waitForView((v) => v.game?.compromised === i + 1)),
        );
        for (const m of crew.filter((c) => c !== target)) {
          expect(m.client.view?.game?.compromised).toBe(i + 1);
        }
      }
    }
    await Promise.all(members.map((m) => m.client.waitForView((v) => v.lobby.phase === 'ended')));
    for (const m of members) {
      expect(m.client.view?.game?.result).toEqual({ winner: 'imposters', reason: 'infection' });
    }
  });
});

describe('bots hold meetings (acceptance)', () => {
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

  it('1 human + 7 bots with meetings on: bots call, gather, vote, and game time stands still meanwhile', async () => {
    const created = await human.ok('lobby:create', { username: 'Human', ...SAFE });
    const room = ts.server.rooms.get(created.code);
    if (!room) throw new Error('no room');
    const tick = (s = 1) => {
      ts.clock.now += s * S;
      room.tick();
    };
    await human.ok('lobby:updateConfig', { patch: { testMode: true, coopChance: 0, playerVisibility: 'all' } });
    await human.ok('lobby:setBoundary', {
      boundary: { type: 'circle', center: HOME, radiusM: 250 },
    });
    room.state.config.botSpeedMps = 6;
    // Crew bots never finish their tasks, so only meetings decide anything here.
    room.state.config.botTaskMinS = 100_000;
    room.state.config.botTaskMaxS = 100_000;
    await human.ok('dev:addBots', { count: 7, meetings: 'random' });
    await human.waitForView((v) => v.lobby.players.length === 8, '8 players');
    await human.locate(ts.clock.now);
    tick();
    tick();
    await human.waitForView(
      (v) => v.lobby.players.filter((p) => p.id !== v.me.id).every((p) => p.ready),
      'bots ready',
    );
    await human.ok('lobby:setReady', { ready: true });
    tick(CFG.startCountdownS);
    await human.waitForView((v) => v.lobby.phase === 'spawning', 'spawning');
    for (let i = 0; i < 3; i++) tick();
    await human.ok('game:forceStart', {});
    tick(CFG.roleRevealS);
    await human.waitForView((v) => v.lobby.phase === 'playing', 'playing');

    let meetingsSeen = 0;
    let wasOpen = false;
    let frozenAt: number | undefined;
    let resultSeen = false;
    let teleported = false;
    let skipped = false;
    for (let i = 0; i < 3000 && room.state.phase === 'playing' && meetingsSeen < 2; i++) {
      tick();
      const game = room.state.game;
      const open = game?.meeting !== undefined;
      if (open && game?.meeting) {
        const stopped = game.clock.reasons.includes('meeting');
        expect(stopped).toBe(true);
        const gameMs = game.clock.gameMs;
        if (frozenAt === undefined) frozenAt = gameMs;
        expect(gameMs).toBe(frozenAt);
        if (game.meeting.stage === 'result' && game.meeting.tallies) resultSeen = true;
        // The human walks to the Base and skips, so the test does not wait out every timer.
        const base = room.state.setup.base;
        if (game.meeting.stage === 'gather' && base && !teleported) {
          teleported = true;
          await human.ok('dev:teleport', { lat: base.lat, lng: base.lng });
        }
        if (game.meeting.stage === 'discuss' && !skipped) {
          skipped = true;
          await human.call('meeting:skipDiscussion', {});
        }
      }
      if (wasOpen && !open) {
        meetingsSeen++;
        frozenAt = undefined;
        teleported = false;
        skipped = false;
      }
      wasOpen = open;
    }
    expect(meetingsSeen).toBeGreaterThanOrEqual(1);
    expect(resultSeen).toBe(true);
    // Bots called the meetings: at least one bot used its allowance.
    expect(room.state.players.some((p) => p.bot && (p.meetingsCalled ?? 0) > 0)).toBe(true);
    // Nothing about the votes leaked to the human: no attributed votes in any frame.
    expect(human.frames.filter((f) => /"votes"|"voter"/.test(f))).toEqual([]);
  }, 180_000);
});

/**
 * Phase 12 over real sockets: a scripted crew win, the results every client receives (and none
 * before the end, scanned in the raw frames), Play again back to a clean lobby, and an abort.
 */
import {
  DEFAULT_CONFIG,
  type PlayerView,
  type ResultsView,
  type TaskCard,
} from '@afterdark/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  errorCode,
  HOME,
  openClient,
  spotInSection,
  startTestServer,
  type TestClient,
  type TestServer,
} from './helpers';

const SAFE = { acceptedSafety: true } as const;
const S = 1000;
/** Field names that exist only in `results`: no frame before the end may carry one. */
const RESULT_FIELDS = ['results', 'scoreSeries', 'tasksDone', 'distanceM', 'infectedAtS', 'awards'];

interface Member {
  client: TestClient;
  name: string;
}

describe('results and play again over sockets', () => {
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

  async function toPlaying(n: number, config: Record<string, unknown> = {}) {
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
    await host.ok('lobby:updateConfig', { patch: { testMode: true, coopChance: 0, ...config } });
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

  const crewIn = (members: Member[]) => members.filter((m) => m.client.view?.me.role === 'crew');
  const cardsOf = (m: Member) => m.client.view?.game?.tasks ?? [];

  async function finishOneTask(code: string, m: Member): Promise<void> {
    const card = cardsOf(m)[0] as TaskCard;
    const spot = spotInSection(m.client.view as PlayerView, card);
    await m.client.ok('dev:teleport', spot);
    for (let i = 0; i < DEFAULT_CONFIG.sectionEntryHoldS + 1; i++) {
      tick(code, 1);
      await m.client.locate(ts.clock.now, spot);
    }
    const seen = await m.client.waitForView(
      (v) => v.game?.tasks?.find((t) => t.id === card.id)?.stage === 'pin',
      'pin revealed',
    );
    const pinned = seen.game?.tasks?.find((t) => t.id === card.id) as Extract<
      TaskCard,
      { stage: 'pin' }
    >;
    await m.client.ok('dev:teleport', { lat: pinned.lat, lng: pinned.lng });
    tick(code, 1);
    await m.client.waitForView(
      (v) =>
        v.game?.tasks?.find((t) => t.id === card.id)?.stage === 'pin' &&
        (v.game.tasks.find((t) => t.id === card.id) as { atPin?: boolean }).atPin === true,
      'at pin',
    );
    await m.client.ok('task:open', { taskId: card.id });
    await m.client.ok('dev:autoComplete', { taskId: card.id });
  }

  /** The crew finish tasks until the target score ends the game. */
  async function crewWin(code: string, members: Member[]) {
    const over = () => ts.server.rooms.get(code)?.state.phase === 'ended';
    for (let round = 0; round < 60 && !over(); round++) {
      for (const m of crewIn(members)) {
        if (over()) break;
        await finishOneTask(code, m);
      }
    }
    return Promise.all(
      members.map((m) => m.client.waitForView((v) => v.lobby.phase === 'ended', 'ended')),
    );
  }

  it('after a crew win every player gets the same, accurate results; before it, nobody gets any field of it', async () => {
    const { code, members } = await toPlaying(5, { targetScore: 40 });
    // The raw frames of the whole game so far carry no results field.
    for (const m of members) {
      const frames = m.client.frames.join('\n');
      for (const f of RESULT_FIELDS) expect(frames, `${m.name}: ${f}`).not.toContain(`"${f}"`);
    }
    const ended = await crewWin(code, members);
    const first = ended[0]?.results as ResultsView;
    expect(first).toBeDefined();
    for (const v of ended) expect(v.results).toEqual(first);

    expect(first).toMatchObject({ winner: 'crew', reason: 'score', aborted: false, crewCount: 4 });
    expect(first.teamScore).toBeGreaterThanOrEqual(40);
    expect(first.targetScore).toBe(40);
    // The reveal matches what each client was told privately.
    for (const m of members) {
      const mine = first.players.find((p) => p.username === m.name);
      expect(mine?.role).toBe(m.client.view?.me.role);
      expect(mine?.tag).toBe(m.client.view?.me.tag);
      expect(mine?.personalScore).toBe(m.client.view?.me.personalScore);
    }
    // Every point of the team score is a finished task by a crew member.
    const crewScores = first.players
      .filter((p) => p.role === 'crew')
      .reduce((n, p) => n + p.personalScore, 0);
    expect(crewScores).toBe(first.teamScore);
    expect(
      first.players.filter((p) => p.role === 'crew').reduce((n, p) => n + p.tasksDone, 0),
    ).toBeGreaterThanOrEqual(5);
    expect(first.players.filter((p) => p.role === 'imposter').every((p) => p.tasksDone === 0)).toBe(
      true,
    );
    // The teleport-driven test moved people, but accepted-fix walking is a whole number and never negative.
    for (const p of first.players)
      expect(Number.isInteger(p.distanceM) && p.distanceM >= 0).toBe(true);
    expect(first.scoreSeries.at(-1)).toEqual({ atS: first.durationS, team: first.teamScore });
    const mvp = first.awards.crewMvp;
    const top = Math.max(
      ...first.players.filter((p) => p.role === 'crew').map((p) => p.personalScore),
    );
    expect(mvp?.value).toBe(top);
  });

  it('Play again: host only, back to a clean lobby with the same area, and a second game starts', async () => {
    const { code, members } = await toPlaying(5, { targetScore: 40 });
    const boundary = members[0]?.client.view?.lobby.map?.boundary;
    await crewWin(code, members);
    const host = members[0] as Member;
    const other = members[1] as Member;
    expect(errorCode(await other.client.call('lobby:playAgain', {}))).toBe('NOT_HOST');

    await host.client.ok('lobby:playAgain', {});
    const lobby = await Promise.all(
      members.map((m) =>
        m.client.waitForView((v) => v.lobby.phase === 'lobby', 'back in the lobby'),
      ),
    );
    for (const v of lobby) {
      expect(v.results).toBeUndefined();
      expect(v.me.role).toBeUndefined();
      expect(v.me.tag).toBeUndefined();
      expect(v.me.personalScore).toBeUndefined();
      expect(v.me.ready).toBe(false);
      expect(v.lobby.players).toHaveLength(5);
      expect(v.lobby.players.every((p) => !p.ready && p.status === 'active')).toBe(true);
      expect(v.lobby.map?.boundary).toEqual(boundary);
      expect(v.lobby.config.targetScore).toBe(40);
      expect(v.lobby.testMode).toBe(true);
    }
    // Playing again is refused once it is a lobby.
    expect(errorCode(await host.client.call('lobby:playAgain', {}))).toBe('WRONG_PHASE');

    // The second game: ready up, countdown, spawn, reveal. Roles are drawn again.
    // Everyone walks back to the meeting point (a jump is the test-mode teleport), then readies.
    for (const m of members) await m.client.ok('dev:teleport', HOME);
    for (const m of members) await m.client.locate(ts.clock.now);
    for (const m of members) await m.client.ok('lobby:setReady', { ready: true });
    tick(code, DEFAULT_CONFIG.startCountdownS);
    await Promise.all(
      members.map((m) =>
        m.client.waitForView((v) => v.lobby.phase === 'spawning', 'spawning again'),
      ),
    );
    for (const m of members) {
      const spawn = m.client.view?.me.spawn;
      await m.client.ok('dev:teleport', { lat: spawn?.lat ?? 0, lng: spawn?.lng ?? 0 });
    }
    const revealed = await Promise.all(
      members.map((m) => m.client.waitForView((v) => v.lobby.phase === 'reveal', 'reveal again')),
    );
    expect(revealed.filter((v) => v.me.role === 'imposter')).toHaveLength(1);
    expect(ts.server.rooms.get(code)?.state.game?.teamScore).toBe(0);
  });

  it('an abort shows results with aborted set and the partial stats', async () => {
    const { code, members } = await toPlaying(5);
    await finishOneTask(code, crewIn(members)[0] as Member);
    await members[0]?.client.ok('game:abort', {});
    const ended = await Promise.all(
      members.map((m) => m.client.waitForView((v) => v.lobby.phase === 'ended', 'ended')),
    );
    const r = ended[0]?.results as ResultsView;
    expect(r).toMatchObject({ winner: null, reason: 'abort', aborted: true });
    expect(r.teamScore).toBeGreaterThan(0);
    expect(r.players).toHaveLength(5);
    expect(r.players.reduce((n, p) => n + p.tasksDone, 0)).toBe(1);
  });
});

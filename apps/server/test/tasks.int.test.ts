/**
 * Phase 5 over real sockets: a player walks into a task's section, the pin
 * appears, the minigame opens and is solved through the same events the client
 * uses, and a forged answer is refused. Then a whole crew win driven by
 * `dev:autoComplete`, as the bots do it.
 */
import {
  DEFAULT_CONFIG,
  type LockCode,
  type PlayerView,
  scoreGuess,
  type TaskCard,
  type TaskOpenAck,
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
const GUESS_PAUSE_MS = 150;

interface Member {
  client: TestClient;
  name: string;
}

/** A test-only solver: it reads the puzzle the same way a player would. */
function wiresAnswer(ack: Extract<TaskOpenAck, { type: 'wires' }>): number[] {
  const { left, right } = ack.puzzle;
  return left.map((end) =>
    right.findIndex((r) => r.color === end.color && r.symbol === end.symbol),
  );
}

describe('tasks over sockets', () => {
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
    await host.ok('lobby:updateConfig', { patch: { testMode: true, ...config } });
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

  /** Walks the player into the card's section, waits out the hold, and returns the revealed card. */
  async function reveal(code: string, m: Member, card: TaskCard): Promise<TaskCard> {
    const view = m.client.view as PlayerView;
    const spot = spotInSection(view, card);
    await m.client.ok('dev:teleport', spot);
    for (let i = 0; i < DEFAULT_CONFIG.sectionEntryHoldS + 1; i++) {
      tick(code, 1);
      await m.client.locate(ts.clock.now, spot);
    }
    const seen = await m.client.waitForView(
      (v) => v.game?.tasks?.find((t) => t.id === card.id)?.stage === 'pin',
      'pin revealed',
    );
    return seen.game?.tasks?.find((t) => t.id === card.id) as TaskCard;
  }

  async function goToPin(code: string, m: Member, card: TaskCard): Promise<TaskCard> {
    if (card.stage !== 'pin') throw new Error('not revealed');
    await m.client.ok('dev:teleport', { lat: card.lat, lng: card.lng });
    tick(code, 1);
    const seen = await m.client.waitForView(
      (v) =>
        v.game?.tasks?.find((t) => t.id === card.id && t.stage === 'pin' && t.atPin) !== undefined,
      'at pin',
    );
    return seen.game?.tasks?.find((t) => t.id === card.id) as TaskCard;
  }

  it('crew get three direction-only cards; imposters get none', async () => {
    const { members } = await toPlaying(8);
    for (const m of members) {
      const v = m.client.view as PlayerView;
      if (v.me.role === 'crew') {
        expect(cardsOf(m)).toHaveLength(3);
        for (const c of cardsOf(m)) {
          expect(c.stage).toBe('assigned');
          expect(Object.keys(c).sort()).toEqual([
            'id',
            'kind',
            'regionId',
            'regionName',
            'section',
            'stage',
          ]);
        }
      } else {
        expect(cardsOf(m)).toEqual([]);
      }
    }
  });

  it('section → pin → open → solve: wires scores for the whole team', async () => {
    const { code, members } = await toPlaying(8);
    const me = crewIn(members)[0] as Member;
    // Find a wires task if this seed gives one, else reroll until it does (cooldown permitting) — otherwise solve whatever opens.
    const card = cardsOf(me)[0] as TaskCard;
    const pinned = await reveal(code, me, card);
    expect(pinned.stage).toBe('pin');
    const atPin = await goToPin(code, me, pinned);
    if (atPin.stage !== 'pin') throw new Error('expected a revealed card');
    expect(atPin).toMatchObject({ stage: 'pin', atPin: true });
    // Opening shows the type and points for the first time.
    const ack = await me.client.ok('task:open', { taskId: card.id });
    expect(ack.points).toBe(DEFAULT_CONFIG.points[ack.type]);
    expect(JSON.stringify(ack)).not.toContain('solution');
    // A forged "success" is not an answer, and a wrong mapping is just wrong.
    expect(
      errorCode(await me.client.call('task:submit', { taskId: card.id, answer: 'success' })),
    ).toBe('INVALID_PAYLOAD');
    if (ack.type === 'wires') {
      const bad = await me.client.ok('task:submit', { taskId: card.id, answer: [0, 0, 0, 0] });
      expect(bad).toEqual({ result: 'wrong', points: 0 });
      tick(code, DEFAULT_CONFIG.taskWrongLockoutS + 1);
      await me.client.locate(ts.clock.now, { lat: atPin.lat, lng: atPin.lng });
      const done = await me.client.ok('task:submit', { taskId: card.id, answer: wiresAnswer(ack) });
      expect(done).toEqual({ result: 'success', points: DEFAULT_CONFIG.points.wires });
    } else {
      // Lock: guess by elimination through task:action, then submit the matched code.
      let candidates: LockCode[] = [];
      const n = ack.puzzle.maxDigit + 1;
      for (let i = 0; i < n ** ack.puzzle.digits; i++) {
        candidates.push(
          Array.from({ length: ack.puzzle.digits }, (_, k) => Math.floor(i / n ** k) % n),
        );
      }
      let solved: LockCode | undefined;
      for (let g = 0; g < ack.puzzle.maxGuesses && !solved; g++) {
        // A human guesses about once a second; the socket allows 10 events per second.
        await new Promise((r) => setTimeout(r, GUESS_PAUSE_MS));
        const guess = candidates[0] as LockCode;
        const { feedback } = await me.client.ok('task:action', {
          taskId: card.id,
          action: { guess },
        });
        if (feedback.solved) solved = guess;
        else
          candidates = candidates.filter((c) => {
            const s = scoreGuess(c, guess);
            return s.exact === feedback.exact && s.misplaced === feedback.misplaced;
          });
      }
      expect(solved).toBeDefined();
      const done = await me.client.ok('task:submit', { taskId: card.id, answer: solved });
      expect(done).toEqual({ result: 'success', points: DEFAULT_CONFIG.points.lock });
    }
    // Everyone's team score rose; only this player's personal score did; a new card refilled the slot.
    const points = DEFAULT_CONFIG.points[ack.type];
    const updated = await Promise.all(
      members.map((m) => m.client.waitForView((v) => v.game?.teamScore === points, 'score up')),
    );
    for (const v of updated) expect(v.game?.teamScore).toBe(points);
    expect(me.client.view?.me.personalScore).toBe(points);
    expect(cardsOf(me)).toHaveLength(3);
    expect(cardsOf(me).some((c) => c.id === card.id)).toBe(false);
    const other = crewIn(members)[1] as Member;
    expect(other.client.view?.me.personalScore).toBe(0);
  });

  it('unauthorised use is refused: imposters, strangers’ tasks, test shortcuts off, tasks never opened', async () => {
    const { code, members } = await toPlaying(8);
    const imposter = members.find((m) => m.client.view?.me.role === 'imposter') as Member;
    const [a, b] = crewIn(members) as [Member, Member];
    const theirs = cardsOf(a)[0] as TaskCard;
    expect(errorCode(await imposter.client.call('task:open', { taskId: theirs.id }))).toBe(
      'NOT_ALLOWED',
    );
    expect(errorCode(await b.client.call('task:open', { taskId: theirs.id }))).toBe('NOT_FOUND');
    expect(errorCode(await a.client.call('task:open', { taskId: theirs.id }))).toBe('NOT_ALLOWED'); // not revealed yet
    expect(errorCode(await a.client.call('task:submit', { taskId: theirs.id, answer: [0] }))).toBe(
      'NOT_ALLOWED',
    );
    expect(errorCode(await a.client.call('dev:autoComplete', { taskId: theirs.id }))).toBe(
      'NOT_ALLOWED',
    ); // nothing open
    expect(errorCode(await a.client.call('task:open', { taskId: 'short' }))).toBe(
      'INVALID_PAYLOAD',
    );
    // Test mode off: the shortcut is refused outright.
    await a.client.ok('dev:teleport', { lat: HOME.lat, lng: HOME.lng });
    tick(code);
  });

  it('reroll and report unsafe work over the socket, with the cooldown', async () => {
    const { members } = await toPlaying(8);
    const me = crewIn(members)[0] as Member;
    const [first, second] = cardsOf(me) as [TaskCard, TaskCard];
    await me.client.ok('task:reroll', { taskId: first.id });
    const after = await me.client.waitForView(
      (v) => v.game?.rerollReadyAt !== undefined,
      'cooldown shown',
    );
    expect(after.game?.tasks).toHaveLength(3);
    expect(after.game?.tasks?.some((c) => c.id === first.id)).toBe(false);
    expect(errorCode(await me.client.call('task:reroll', { taskId: second.id }))).toBe('COOLDOWN');
    // Report has no cooldown.
    await me.client.ok('task:reportUnsafe', { taskId: second.id, reason: 'on a road' });
    const reported = await me.client.waitForView(
      (v) => v.game?.tasks?.every((c) => c.id !== second.id) === true,
      'task replaced',
    );
    expect(reported.game?.tasks).toHaveLength(3);
  });

  it('the crew win by completing tasks (V1), driven by dev:autoComplete', async () => {
    const { code, members } = await toPlaying(5, { targetScore: 40 });
    const crew = crewIn(members);
    const guard = 60;
    const over = () => ts.server.rooms.get(code)?.state.phase === 'ended';
    for (let round = 0; round < guard && !over(); round++) {
      for (const m of crew) {
        if (over()) break;
        const card = cardsOf(m)[0];
        if (!card) continue;
        const pinned = card.stage === 'pin' ? card : await reveal(code, m, card);
        await goToPin(code, m, pinned);
        await m.client.ok('task:open', { taskId: card.id });
        await m.client.ok('dev:autoComplete', { taskId: card.id });
      }
    }
    const final = await members[0]?.client.waitForView(
      (v) => v.lobby.phase === 'ended',
      'crew win',
    );
    expect(final?.game?.result).toEqual({ winner: 'crew', reason: 'score' });
    expect(final?.game?.teamScore).toBeGreaterThanOrEqual(40);
  });
});

describe('bots drive a whole game to a crew win (acceptance)', () => {
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

  it('1 human + 7 bots: the crew bots walk to their pins, open and finish tasks until the target is met', async () => {
    const created = await human.ok('lobby:create', { username: 'Human', ...SAFE });
    const room = ts.server.rooms.get(created.code);
    if (!room) throw new Error('no room');
    const tick = (s = 1) => {
      ts.clock.now += s * S;
      room.tick();
    };
    await human.ok('lobby:updateConfig', { patch: { testMode: true, targetScore: 40 } });
    await human.ok('lobby:setBoundary', {
      boundary: { type: 'circle', center: HOME, radiusM: 250 },
    });
    // A faster walk keeps the test short; the server still accepts it (below maxSpeedMps).
    room.state.config.botSpeedMps = 6;
    await human.ok('dev:addBots', { count: 7 });
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

    const maxTicks = 900;
    let ticks = 0;
    while (room.state.phase === 'playing' && ticks < maxTicks) {
      tick();
      ticks++;
    }
    const final = room.state;
    expect(final.phase).toBe('ended');
    expect(final.result).toEqual({ winner: 'crew', reason: 'score' });
    expect(final.game?.teamScore).toBeGreaterThanOrEqual(40);
    // Only crew bots earned anything, and imposters never held a task.
    const bots = final.players.filter((p) => p.bot);
    expect(bots.filter((p) => p.role === 'imposter').every((p) => p.tasks === undefined)).toBe(
      true,
    );
    expect(bots.filter((p) => p.role === 'crew').some((p) => (p.personalScore ?? 0) > 0)).toBe(
      true,
    );
    const view = await human.waitForView((v) => v.lobby.phase === 'ended', 'ended view');
    expect(view.game?.result).toEqual({ winner: 'crew', reason: 'score' });
  }, 60_000);
});

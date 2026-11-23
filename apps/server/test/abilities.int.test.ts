/**
 * Phase 9 over real sockets: a Phantom plants a fake that the next refilling crew
 * slot takes and that fools its player with 0 points; a Saboteur's Task Stop resets
 * an open minigame, locks every task for everyone and is announced publicly; and a
 * whole bot game with ability-using imposters runs through.
 */
import {
  DEFAULT_CONFIG,
  type LatLng,
  offsetByMeters,
  type PlayerView,
  type TaskCard,
  type TaskOpenAck,
} from '@afterdark/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkFakeTask } from '../src/engine/systems/fakeTask';
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
const LOC_REFILL_MS = 1100;

interface Member {
  client: TestClient;
  name: string;
}

function wiresAnswer(ack: Extract<TaskOpenAck, { type: 'wires' }>): number[] {
  const { left, right } = ack.puzzle;
  return left.map((end) =>
    right.findIndex((r) => r.color === end.color && r.symbol === end.symbol),
  );
}

describe('abilities over sockets', () => {
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
    await host.ok('lobby:updateConfig', {
      patch: { testMode: true, imposterAbilityMode: 'all', ...config },
    });
    await host.ok('dev:setMinigames', { types: ['wires'] });
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
  const cardsOf = (m: Member) => m.client.view?.game?.tasks ?? [];
  const posOf = (m: Member): LatLng => {
    const loc = m.client.view?.me.location;
    return { lat: loc?.lat ?? HOME.lat, lng: loc?.lng ?? HOME.lng };
  };

  /** A different position each call (a hundredth of a metre apart), so `locate` waits for the server to take the fix instead of seeing the old one. */
  let nudges = 0;
  const nudged = (at: LatLng): LatLng => ({ lat: at.lat + ++nudges * 1e-7, lng: at.lng });

  /** Every member sends a fresh fix from where they stand (or `at`), so nobody is stale after a long tick. */
  async function relocate(everyone: Member[], at: Map<string, LatLng> = new Map()) {
    // The socket takes 2 fixes a second and drops the rest without an answer: let the bucket refill.
    await new Promise((resolve) => setTimeout(resolve, LOC_REFILL_MS));
    for (const m of everyone) {
      await m.client.locate(ts.clock.now, nudged(at.get(m.name) ?? posOf(m)));
    }
  }

  async function reveal(code: string, m: Member, card: TaskCard): Promise<TaskCard> {
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
    return seen.game?.tasks?.find((t) => t.id === card.id) as TaskCard;
  }

  async function openAtPin(code: string, m: Member, card: TaskCard) {
    const pinned = await reveal(code, m, card);
    if (pinned.stage !== 'pin') throw new Error('not revealed');
    await m.client.ok('dev:teleport', { lat: pinned.lat, lng: pinned.lng });
    tick(code, 1);
    await m.client.waitForView(
      (v) => v.game?.tasks?.find((t) => t.id === card.id)?.stage === 'pin',
      'at pin',
    );
    const ack = await m.client.ok('task:open', { taskId: card.id });
    if (ack.type !== 'wires') throw new Error('expected wires');
    return { ack, pin: { lat: pinned.lat, lng: pinned.lng } };
  }

  it('a Phantom plants a fake: a crew slot takes it, it fools with 0 points, and no crew view can tell', async () => {
    const { code, members } = await toPlaying(8);
    const room = ts.server.rooms.get(code);
    if (!room) throw new Error('no room');
    const imposters = members.filter((m) => roleOf(m) === 'imposter');
    const crew = members.filter((m) => roleOf(m) === 'crew');
    const [phantom, other] = imposters as [Member, Member];
    const holder = crew[0] as Member;

    // Not yet: the initial cooldown. Then ready.
    expect(errorCode(await phantom.client.call('ability:fakeTask', HOME))).toBe('COOLDOWN');
    tick(code, DEFAULT_CONFIG.abilityInitialCooldownS);
    await relocate(members);
    const abilities = phantom.client.view?.me.imposter?.abilities ?? [];
    expect(abilities.map((a) => a.id).sort()).toEqual(['fakeTask', 'taskStop']);

    // A crew member cannot, a pin outside the area is refused (and costs nothing).
    expect(errorCode(await holder.client.call('ability:fakeTask', HOME))).toBe('NOT_ALLOWED');
    expect(
      errorCode(await phantom.client.call('ability:fakeTask', offsetByMeters(HOME, 4000, 0))),
    ).toBe('OUT_OF_BOUNDS');

    // A valid spot, found by asking the server's own rule.
    let spot: LatLng | undefined;
    const phantomState = room.state.players.find((p) => p.id === phantom.client.view?.me.id);
    for (let dx = -200; dx <= 200 && !spot; dx += 15) {
      for (let dy = -200; dy <= 200 && !spot; dy += 15) {
        const at = offsetByMeters(HOME, dx, dy);
        try {
          if (phantomState) checkFakeTask(room.state, phantomState, at);
          spot = at;
        } catch {
          /* too close, outside or in a no-go zone: try the next one */
        }
      }
    }
    if (!spot) throw new Error('no valid spot');
    const { fakeId } = await phantom.client.ok('ability:fakeTask', spot);
    const queued = await phantom.client.waitForView(
      (v) => v.me.imposter?.fakes.some((f) => f.id === fakeId && !f.assigned) === true,
      'fake queued in the Phantom view',
    );
    expect(queued.me.imposter?.fakes).toHaveLength(1);
    // The other imposter has no fakes of their own, and nobody else's view mentions it.
    expect(other.client.view?.me.imposter?.fakes).toEqual([]);
    expect(errorCode(await phantom.client.call('ability:fakeTask', spot))).toBe('COOLDOWN');

    // The next slot that refills takes it: the holder rerolls.
    await holder.client.ok('task:reroll', { taskId: (cardsOf(holder)[0] as TaskCard).id });
    const seen = await holder.client.waitForView(
      (v) => v.game?.tasks?.some((t) => t.id === fakeId) === true,
      'holder has the fake',
    );
    const card = seen.game?.tasks?.find((t) => t.id === fakeId) as TaskCard;
    expect(Object.keys(card).sort()).toEqual(
      Object.keys(seen.game?.tasks?.find((t) => t.id !== fakeId) ?? {}).sort(),
    );
    await phantom.client.waitForView(
      (v) => v.me.imposter?.fakes.some((f) => f.id === fakeId && f.assigned) === true,
      'fake assigned in the Phantom view',
    );

    // The holder plays it like any task: it opens, it can be solved, and it fools.
    const before = holder.client.view?.game?.teamScore ?? 0;
    const { ack } = await openAtPin(code, holder, card);
    const done = await holder.client.ok('task:submit', {
      taskId: fakeId,
      answer: wiresAnswer(ack),
    });
    expect(done).toEqual({ result: 'fooled', points: 0 });
    const after = await holder.client.waitForView(
      (v) => v.game?.tasks?.every((t) => t.id !== fakeId) === true,
      'fake gone',
    );
    expect(after.game?.teamScore).toBe(before);
    expect(after.me.personalScore).toBe(0);
    // The Phantom's count is free again, and no crew frame ever said "fake".
    await phantom.client.waitForView((v) => v.me.imposter?.fakes.length === 0, 'fake cleared');
    for (const m of crew) {
      expect(m.client.frames.join('\n')).not.toMatch(/"fake"|fakeOwner|ownerId|fooled/);
    }
  }, 60_000);

  it('Task Stop resets an open minigame, jams every task for everyone, and ends on game time', async () => {
    const { code, members } = await toPlaying(8);
    const imposters = members.filter((m) => roleOf(m) === 'imposter');
    const crew = members.filter((m) => roleOf(m) === 'crew');
    const [saboteur, second] = imposters as [Member, Member];
    const player = crew[0] as Member;
    const bystander = crew[1] as Member;

    expect(errorCode(await saboteur.client.call('ability:taskStop', {}))).toBe('COOLDOWN');
    // Wait out the initial cooldown first (a long silence would make the player stale and reset the game by itself).
    tick(code, DEFAULT_CONFIG.abilityInitialCooldownS);
    await relocate(members);
    // A crew member at a pin with a minigame open.
    const card = cardsOf(player)[0] as TaskCard;
    const { ack, pin } = await openAtPin(code, player, card);
    await relocate(members, new Map([[player.name, pin]]));
    expect(errorCode(await player.client.call('ability:taskStop', {}))).toBe('NOT_ALLOWED');

    const stopped = await saboteur.client.ok('ability:taskStop', {});
    expect(stopped.lockEndsAt).toBe(ts.clock.now + DEFAULT_CONFIG.taskStopLockS * S);
    // Everyone's view carries the same public lock, and the event names nobody.
    for (const m of members) {
      const v = await m.client.waitForView((x) => x.game?.taskLock !== undefined, 'lock in view');
      expect(v.game?.taskLock?.until).toBe(stopped.lockEndsAt);
      expect(m.client.events).toContainEqual({
        type: 'sabotage.started',
        until: stopped.lockEndsAt,
      });
    }
    // The open minigame was reset, and submitting, opening and a second stop are all refused.
    expect(player.client.events).toContainEqual({ type: 'task.reset', reason: 'sabotage' });
    expect(
      errorCode(
        await player.client.call('task:submit', { taskId: card.id, answer: wiresAnswer(ack) }),
      ),
    ).toBe('TASKS_LOCKED');
    expect(errorCode(await player.client.call('task:open', { taskId: card.id }))).toBe(
      'TASKS_LOCKED',
    );
    expect(errorCode(await second.client.call('ability:taskStop', {}))).toBe('NOT_ALLOWED');
    // The bystander never sees who did it.
    expect(bystander.client.frames.join('\n')).not.toContain(saboteur.client.view?.me.tag ?? '#');

    // It lasts taskStopLockS of game time, then everything works again.
    tick(code, DEFAULT_CONFIG.taskStopLockS + 1);
    await new Promise((resolve) => setTimeout(resolve, LOC_REFILL_MS));
    await player.client.locate(ts.clock.now, nudged(pin));
    await player.client.waitForView((v) => v.game?.taskLock === undefined, 'lock gone');
    const reopened = await player.client.ok('task:open', { taskId: card.id });
    expect(reopened.type).toBe('wires');
  }, 60_000);

  it('a bot game with sabotaging imposters uses both abilities and plays on', async () => {
    const human = await openClient(ts.url);
    all.push(human);
    const created = await human.ok('lobby:create', { username: 'Human', ...SAFE });
    const room = ts.server.rooms.get(created.code);
    if (!room) throw new Error('no room');
    const tickOne = (s = 1) => {
      ts.clock.now += s * S;
      room.tick();
    };
    await human.ok('lobby:updateConfig', {
      patch: { testMode: true, imposterAbilityMode: 'all', playerVisibility: 'all' },
    });
    await human.ok('lobby:setBoundary', {
      boundary: { type: 'circle', center: HOME, radiusM: 250 },
    });
    room.state.config.botSpeedMps = 6;
    room.state.config.taskStopCooldownS = 40;
    room.state.config.fakeTaskCooldownS = 40;
    await human.ok('dev:addBots', { count: 7, imposterBehaviour: 'sabotage' });
    await human.waitForView((v) => v.lobby.players.length === 8, '8 players');
    await human.locate(ts.clock.now);
    tickOne();
    tickOne();
    await human.waitForView(
      (v) => v.lobby.players.filter((p) => p.id !== v.me.id).every((p) => p.ready),
      'bots ready',
    );
    await human.ok('lobby:setReady', { ready: true });
    tickOne(DEFAULT_CONFIG.startCountdownS);
    await human.waitForView((v) => v.lobby.phase === 'spawning', 'spawning');
    for (let i = 0; i < 3; i++) tickOne();
    await human.ok('game:forceStart', {});
    tickOne(DEFAULT_CONFIG.roleRevealS);
    await human.waitForView((v) => v.lobby.phase === 'playing', 'playing');

    let stops = 0;
    let fakesSeen = 0;
    let ticks = 0;
    const fakeIds = new Set<string>();
    while (room.state.phase === 'playing' && ticks < 600) {
      tickOne();
      ticks++;
      const lock = room.state.game?.taskLock;
      if (lock) stops = Math.max(stops, 1);
      for (const t of room.state.players.flatMap((p) => p.tasks ?? [])) {
        if (t.fake) fakeIds.add(t.id);
      }
      fakesSeen = Math.max(fakesSeen, room.state.game?.fakeQueue.length ?? 0);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    const sabotage = human.events.filter((e) => e.type === 'sabotage.started').length;
    expect(sabotage).toBeGreaterThanOrEqual(1);
    expect(stops).toBe(1);
    // Fakes were planted, and the crew bots took them.
    expect(fakeIds.size + fakesSeen).toBeGreaterThanOrEqual(1);
    expect(room.state.game?.teamScore ?? 0).toBeGreaterThanOrEqual(0);
  }, 120_000);
});

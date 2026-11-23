/**
 * Phase 10 over real sockets: a co-op task completes through `coop:start`, `coop:join` and
 * `coop:submit` for all three crediting paths (crew + crew, crew + an assigned imposter, crew +
 * a camouflaged stand-in), each player is shown only their own PIN and reads the other's off the
 * partner's "phone", and a whole bot game with co-op on plays through. The pairing itself is
 * injected into the room (the draw is random); everything after it is the real protocol.
 */
import { DEFAULT_CONFIG, type GameEvent, type LatLng } from '@afterdark/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CoopSession, RoomState } from '../src/engine/state';
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
const LOC_REFILL_MS = 1100;

interface Member {
  client: TestClient;
  name: string;
}

describe('co-op over sockets', () => {
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
  const roleOf = (m: Member) => m.client.view?.me.role;
  let nudges = 0;
  const nudged = (at: LatLng): LatLng => ({ lat: at.lat + ++nudges * 1e-7, lng: at.lng });

  async function toPlaying(n: number, config: Record<string, unknown> = {}) {
    const host = await openClient(ts.url);
    all.push(host);
    const created = await host.ok('lobby:create', { username: 'Host', ...SAFE });
    const members: Member[] = [{ client: host, name: 'Host' }];
    for (let i = 1; i < n; i++) {
      const client = await openClient(ts.url);
      all.push(client);
      await client.ok('lobby:join', { code: created.code, username: `Player ${i}`, ...SAFE });
      members.push({ client, name: `Player ${i}` });
    }
    await host.ok('lobby:updateConfig', {
      patch: { testMode: true, coopChance: 0, imposterAbilityMode: 'all', ...config },
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
    const room = ts.server.rooms.get(created.code);
    if (!room) throw new Error('no room');
    return { code: created.code, members, room };
  }

  /** Injects a co-op task for `owner` and `partner` with the pin revealed, as the engine's draw would make it. */
  function inject(
    state: RoomState,
    owner: Member,
    partner: Member,
  ): { session: CoopSession; pin: LatLng } {
    const o = state.players.find((p) => p.id === owner.client.view?.me.id);
    const p = state.players.find((x) => x.id === partner.client.view?.me.id);
    if (!o?.tasks?.[0] || !p || !state.game) throw new Error('no such players');
    const base = o.tasks[0];
    base.kind = 'coop';
    base.type = 'coop_pin';
    base.stage = 'pin';
    base.coopId = `int-session-${String(state.game.coops.length).padStart(5, '0')}`;
    const card = { ...base, id: `int-partner-${String(state.game.coops.length).padStart(5, '0')}` };
    p.partnerTask = card;
    const session: CoopSession = {
      id: base.coopId,
      ownerId: o.id,
      assignedId: p.id,
      ownerTaskId: base.id,
      partnerTaskId: card.id,
      ...(base.pointId === undefined ? {} : { pointId: base.pointId }),
      lat: base.lat,
      lng: base.lng,
      expiresAtGameMs: 1e12,
      phase: 'idle',
      done: [],
      lockedUntilGameMs: {},
    };
    state.game.coops.push(session);
    return { session, pin: { lat: base.lat, lng: base.lng } };
  }

  async function relocate(everyone: Member[], at: Map<string, LatLng> = new Map()) {
    await new Promise((resolve) => setTimeout(resolve, LOC_REFILL_MS));
    for (const m of everyone) {
      const loc = m.client.view?.me.location;
      const here = at.get(m.name) ?? { lat: loc?.lat ?? HOME.lat, lng: loc?.lng ?? HOME.lng };
      await m.client.locate(ts.clock.now, nudged(here));
    }
  }

  const cardOf = (m: Member, id: string) => m.client.view?.game?.tasks?.find((t) => t.id === id);
  const eventTypes = (m: Member): GameEvent['type'][] => m.client.events.map((e) => e.type);

  /** Both players stand at the pin; the owner starts, the partner (or stand-in) joins; they swap PINs and submit. */
  async function play(opts: {
    code: string;
    room: ReturnType<typeof ts.server.rooms.get>;
    members: Member[];
    owner: Member;
    partner: Member;
    pin: LatLng;
    ownerCardId: string;
    partnerCardId: string;
    joiner: Member;
    joinId: string;
  }) {
    const { code, owner, joiner, pin } = opts;
    await owner.client.ok('dev:teleport', pin);
    await joiner.client.ok('dev:teleport', pin);
    tick(code, 1);
    await relocate(
      opts.members,
      new Map([
        [owner.name, pin],
        [joiner.name, pin],
      ]),
    );
    await owner.client.ok('coop:start', { taskId: opts.ownerCardId });
    await owner.client.waitForView((v) => v.game?.coop?.phase === 'waiting', 'owner waiting');
    // The joiner is not yet in the session: the card says the partner is waiting.
    const join = await joiner.client.ok('coop:join', { taskId: opts.joinId });
    await owner.client.waitForView((v) => v.game?.coop?.phase === 'active', 'owner active');
    const ownerShows = owner.client.view?.game?.coop?.puzzle?.show ?? '';
    const joinerShows = join.puzzle.show;
    expect(ownerShows).toHaveLength(DEFAULT_CONFIG.coopPinDigits);
    expect(joinerShows).not.toBe(ownerShows);
    // Each side types what the other shows.
    const first = await owner.client.ok('coop:submit', {
      taskId: opts.ownerCardId,
      answer: { pin: joinerShows },
    });
    expect(first).toEqual({ result: 'waiting', points: 0 });
    const done = await joiner.client.ok('coop:submit', {
      taskId: opts.joinId,
      answer: { pin: ownerShows },
    });
    return { done, ownerShows, joinerShows };
  }

  it('crew + crew: team +12, +6 each, partner card gone, owner slot refilled', async () => {
    const { code, members, room } = await toPlaying(6);
    const crew = members.filter((m) => roleOf(m) === 'crew');
    const [owner, partner] = crew as [Member, Member];
    const { session, pin } = inject(room.state, owner, partner);
    tick(code, 1);
    await owner.client.waitForView(() => cardOf(owner, session.ownerTaskId)?.kind === 'coop');
    await partner.client.waitForView(() => cardOf(partner, session.partnerTaskId)?.kind === 'coop');
    const teamBefore = owner.client.view?.game?.teamScore ?? 0;
    const res = await play({
      code,
      room,
      members,
      owner,
      partner,
      pin,
      ownerCardId: session.ownerTaskId,
      partnerCardId: session.partnerTaskId,
      joiner: partner,
      joinId: session.partnerTaskId,
    });
    expect(res.done).toEqual({ result: 'success', points: DEFAULT_CONFIG.coopPersonalPoints });
    await owner.client.waitForView(
      (v) => (v.game?.teamScore ?? 0) === teamBefore + DEFAULT_CONFIG.points.coop_pin,
      'team +12',
    );
    await owner.client.waitForView((v) => v.game?.coop === undefined, 'session over');
    expect(owner.client.view?.me.personalScore).toBe(DEFAULT_CONFIG.coopPersonalPoints);
    await partner.client.waitForView(
      (v) => v.me.personalScore === DEFAULT_CONFIG.coopPersonalPoints,
    );
    expect(cardOf(partner, session.partnerTaskId)).toBeUndefined();
    expect(owner.client.view?.game?.tasks?.length).toBe(DEFAULT_CONFIG.taskSlots);
    expect(eventTypes(owner)).toContain('task.completed');
    // A bystander sees neither tag nor PIN in any frame.
    const by = crew[2] as Member;
    const frames = by.client.frames.join('\n');
    expect(frames).not.toContain(owner.client.view?.me.tag ?? '#');
    expect(frames).not.toContain(res.ownerShows ? `"${res.ownerShows}"` : '#');
    expect(frames).not.toContain(`"${res.joinerShows}"`);
  }, 60_000);

  it('crew + assigned imposter: team +12, crew +6, imposter +0 and a recovered cooldown', async () => {
    const { code, members, room } = await toPlaying(6);
    const owner = members.find((m) => roleOf(m) === 'crew') as Member;
    const imp = members.find((m) => roleOf(m) === 'imposter') as Member;
    tick(code, DEFAULT_CONFIG.abilityInitialCooldownS);
    await relocate(members);
    const impState = room.state.players.find((p) => p.id === imp.client.view?.me.id);
    if (impState?.abilities?.taskStop) impState.abilities.taskStop.readyAtGameMs += 1000 * S;
    const { session, pin } = inject(room.state, owner, imp);
    tick(code, 1);
    await imp.client.waitForView(
      () => cardOf(imp, session.partnerTaskId)?.kind === 'coop',
      'imposter has the partner card',
    );
    // The imposter's only task is the partner card; it carries the owner's tag.
    expect(cardOf(imp, session.partnerTaskId)?.partnerTag).toBe(owner.client.view?.me.tag);
    const before =
      imp.client.view?.me.imposter?.abilities.find((a) => a.id === 'taskStop')?.readyAt ?? 0;
    const res = await play({
      code,
      room,
      members,
      owner,
      partner: imp,
      pin,
      ownerCardId: session.ownerTaskId,
      partnerCardId: session.partnerTaskId,
      joiner: imp,
      joinId: session.partnerTaskId,
    });
    expect(res.done).toEqual({ result: 'success', points: 0 });
    await imp.client.waitForView(
      (v) =>
        (v.me.imposter?.abilities.find((a) => a.id === 'taskStop')?.readyAt ?? before) < before,
      'cooldown recovered',
    );
    expect(imp.client.view?.me.personalScore).toBe(0);
    expect(owner.client.view?.me.personalScore ?? 0).toBeGreaterThanOrEqual(
      DEFAULT_CONFIG.coopPersonalPoints,
    );
  }, 60_000);

  it('crew + camouflaged stand-in: the owner is credited as normal and the real partner’s card expires', async () => {
    const { code, members, room } = await toPlaying(6);
    const crew = members.filter((m) => roleOf(m) === 'crew');
    const [owner, realPartner] = crew as [Member, Member];
    const imp = members.find((m) => roleOf(m) === 'imposter') as Member;
    tick(code, DEFAULT_CONFIG.abilityInitialCooldownS);
    await relocate(members);
    const ack = await imp.client.ok('ability:camouflage', {});
    expect(ack.endsAt).toBeGreaterThan(ts.clock.now);
    const disguised = await imp.client.waitForView(
      (v) => v.me.imposter?.camouflage !== undefined,
      'disguise in view',
    );
    expect(disguised.me.imposter?.camouflage?.decoyTasks).toHaveLength(DEFAULT_CONFIG.taskSlots);
    // Nobody else's view changed: the crew still have only their own cards and no disguise key.
    expect(JSON.stringify(owner.client.view)).not.toContain('camouflage');

    const { session, pin } = inject(room.state, owner, realPartner);
    tick(code, 1);
    await owner.client.waitForView(() => cardOf(owner, session.ownerTaskId)?.kind === 'coop');
    await owner.client.ok('dev:teleport', pin);
    await imp.client.ok('dev:teleport', pin);
    tick(code, 1);
    await relocate(
      members,
      new Map([
        [owner.name, pin],
        [imp.name, pin],
      ]),
    );
    // Real partner is not there; the owner waits; the imposter is offered the seat.
    await owner.client.ok('coop:start', { taskId: session.ownerTaskId });
    const offered = await imp.client.waitForView(
      (v) => v.me.imposter?.camouflage?.join?.taskId === session.id,
      'seat offered',
    );
    expect(offered.me.imposter?.camouflage?.join).toEqual({ taskId: session.id });
    // The owner's own task id means nothing to the imposter; only the offered id works.
    expect(errorCode(await imp.client.call('coop:join', { taskId: session.ownerTaskId }))).toBe(
      'NOT_FOUND',
    );
    const joined = await imp.client.ok('coop:join', { taskId: session.id });
    await owner.client.waitForView((v) => v.game?.coop?.phase === 'active', 'owner active');
    // The real partner can no longer take the seat (E18).
    expect(
      errorCode(await realPartner.client.call('coop:join', { taskId: session.partnerTaskId })),
    ).toBe('NOT_ALLOWED');
    const ownerShows = owner.client.view?.game?.coop?.puzzle?.show ?? '';
    await owner.client.ok('coop:submit', {
      taskId: session.ownerTaskId,
      answer: { pin: joined.puzzle.show },
    });
    const done = await imp.client.ok('coop:submit', {
      taskId: session.id,
      answer: { pin: ownerShows },
    });
    expect(done).toEqual({ result: 'success', points: 0 });
    await owner.client.waitForView(
      (v) => v.me.personalScore === DEFAULT_CONFIG.coopPersonalPoints,
      'owner credited',
    );
    expect(eventTypes(owner)).toContain('task.completed');
    expect(eventTypes(owner)).not.toContain('task.expired');
    // The real partner's copy closes as an ordinary expiry.
    await realPartner.client.waitForView(
      () => cardOf(realPartner, session.partnerTaskId) === undefined,
      'partner card gone',
    );
    expect(eventTypes(realPartner)).toContain('task.expired');
    expect(realPartner.client.view?.me.personalScore ?? 0).toBe(0);
  }, 60_000);

  it('a bot game with co-op on and sabotaging imposters runs through and some co-ops finish', async () => {
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
      patch: {
        testMode: true,
        coopChance: 0.5,
        imposterAbilityMode: 'all',
        playerVisibility: 'all',
        // This test is about co-op, so keep the solo mix to the two games that need no walking twice.
        minigamesEnabled: ['wires', 'lock'],
      },
    });
    await human.ok('lobby:setBoundary', {
      boundary: { type: 'circle', center: HOME, radiusM: 250 },
    });
    room.state.config.botSpeedMps = 6;
    room.state.config.targetScore = 400;
    await human.ok('dev:addBots', { count: 7, imposterBehaviour: 'wander' });
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

    const active = new Set<string>();
    const finished = new Set<string>();
    let ticks = 0;
    while (room.state.phase === 'playing' && ticks < 900) {
      tickOne();
      ticks++;
      for (const c of room.state.game?.coops ?? []) {
        if (c.phase === 'active') active.add(c.id);
      }
      for (const id of active) {
        if (!room.state.game?.coops.some((c) => c.id === id)) finished.add(id);
      }
    }
    expect(active.size).toBeGreaterThanOrEqual(1);
    expect(room.state.game?.teamScore ?? 0).toBeGreaterThan(0);
    // At least one session that went active ended (completed or expired) without breaking the room.
    expect(finished.size).toBeGreaterThanOrEqual(1);
  }, 180_000);

  it(
    'sabotaging imposter bots disguise themselves and stand in for a waiting crew member',
    // Player ids are random, so which imposter sits near a waiting crew member differs per run: allow retries (flaky since Phase 10).
    { timeout: 180_000, retry: 4 },
    async () => {
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
        patch: {
          testMode: true,
          coopChance: 0.5,
          imposterAbilityMode: 'all',
          playerVisibility: 'all',
        },
      });
      await human.ok('lobby:setBoundary', {
        boundary: { type: 'circle', center: HOME, radiusM: 250 },
      });
      room.state.config.botSpeedMps = 6;
      room.state.config.targetScore = 400;
      room.state.config.infectionCooldownS = 100000;
      room.state.config.coopChance = 0.5;
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

      const active = new Set<string>();
      const finished = new Set<string>();
      let ticks = 0;
      let standIns = 0;
      while (room.state.phase === 'playing' && ticks < 900) {
        tickOne();
        ticks++;
        for (const c of room.state.game?.coops ?? []) {
          if (c.phase === 'active') active.add(c.id);
          if (
            c.phase === 'active' &&
            c.joinerId &&
            c.joinerId !== c.assignedId &&
            room.state.players.find((p) => p.id === c.joinerId)?.role === 'imposter'
          )
            standIns++;
        }
        for (const id of active) {
          if (!room.state.game?.coops.some((c) => c.id === id)) finished.add(id);
        }
      }
      expect(standIns).toBeGreaterThanOrEqual(1);
      expect(room.state.game?.teamScore ?? 0).toBeGreaterThan(0);
      // At least one session that went active ended (completed or expired) without breaking the room.
      expect(finished.size).toBeGreaterThanOrEqual(1);
    },
  );
});

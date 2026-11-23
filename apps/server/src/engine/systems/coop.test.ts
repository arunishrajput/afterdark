import { distanceM, offsetByMeters } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { gameNow } from '../clock';
import {
  active,
  CFG,
  eventsTo,
  gather,
  get,
  join,
  pair,
  pin,
  ready,
  replyOf,
  run0,
  sessionOf,
  start,
  submit,
  waiting,
} from '../coopKit';
import type { CoopSession, RoomState } from '../state';
import {
  advanceTo,
  advanceWithEffects,
  crewOf,
  errCode,
  moveTo,
  newLobby,
  run,
  S,
  toPlaying,
} from '../testkit';
import { eligiblePartners, heldTasks } from './coopPairing';

describe('co-op generation (10.1, TASKS §5.1)', () => {
  it('rolls co-op tasks that link an owner card and a partner card', () => {
    const { state } = toPlaying(
      newLobby({ players: 8, config: { minigamesEnabled: ['wires'], coopChance: 1 } }),
    );
    const coops = state.game!.coops;
    expect(coops.length).toBeGreaterThan(0);
    for (const c of coops) {
      const owner = get(state, c.ownerId);
      const partner = get(state, c.assignedId);
      expect(owner.role).toBe('crew');
      expect(c.assignedId).not.toBe(c.ownerId);
      const own = owner.tasks!.find((t) => t.coopId === c.id)!;
      expect(own).toMatchObject({ kind: 'coop', type: 'coop_pin', id: c.ownerTaskId });
      expect(partner.partnerTask).toMatchObject({
        kind: 'coop',
        coopId: c.id,
        id: c.partnerTaskId,
      });
      expect(partner.partnerTask!.id).not.toBe(own.id);
      expect(distanceM(partner.partnerTask!, own)).toBe(0);
      expect(c.phase).toBe('idle');
    }
  });

  it('never gives anyone two partner tasks, and every pairing has a crew owner (no imposter pairs)', () => {
    for (const radarSalt of ['a', 'b', 'c', 'd', 'e']) {
      const { state } = toPlaying(
        newLobby({
          players: 10,
          radarSalt,
          config: { minigamesEnabled: ['wires'], coopChance: 1 },
        }),
      );
      const partners = state.players.filter((p) => p.partnerTask);
      const ids = state.game!.coops.map((c) => c.assignedId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(partners.length).toBe(ids.length);
      for (const c of state.game!.coops) expect(get(state, c.ownerId).role).toBe('crew');
    }
  });

  it('can pick an imposter as the partner, and a crew member', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 30 && kinds.size < 2; i++) {
      const { state } = toPlaying(
        newLobby({
          players: 8,
          radarSalt: `s${i}`,
          config: { minigamesEnabled: ['wires'], coopChance: 1 },
        }),
      );
      for (const c of state.game!.coops) kinds.add(get(state, c.assignedId).role ?? '');
    }
    expect(kinds).toEqual(new Set(['crew', 'imposter']));
  });

  it('falls back to a solo task when nobody can be the partner', () => {
    const { state, now } = toPlaying(
      newLobby({ players: 4, config: { minigamesEnabled: ['wires'], coopChance: 1 } }),
    );
    // Four players fit at most four partner cards; every crew refill after that is solo, and total cards are still taskSlots.
    for (const p of crewOf(state)) expect(p.tasks).toHaveLength(CFG.taskSlots);
    expect(state.players.filter((p) => p.partnerTask).length).toBeLessThanOrEqual(4);
    expect(now).toBeGreaterThan(0);
    const owners = new Set(state.game!.coops.map((c) => c.ownerId));
    for (const p of crewOf(state)) {
      expect(p.tasks!.filter((t) => t.kind === 'coop').length).toBeLessThanOrEqual(
        owners.has(p.id) ? 3 : 0,
      );
    }
  });

  it('only rolls co-op when coopChance is positive', () => {
    const { state } = toPlaying(newLobby({ players: 8, config: { minigamesEnabled: ['wires'] } }));
    expect(state.game!.coops).toHaveLength(0);
    expect(state.players.every((p) => p.partnerTask === undefined)).toBe(true);
  });

  it('excludes the owner, a player holding a partner task, spectators and a partner already paired with the owner', () => {
    const f = ready();
    const s = structuredClone(f.state);
    const owner = get(s, f.a);
    const all = eligiblePartners(s, owner).map((p) => p.id);
    expect(all).not.toContain(f.a);
    expect(all).toContain(f.imp);
    get(s, f.b).partnerTask = { ...owner.tasks![0]!, id: 'x' };
    expect(eligiblePartners(s, owner).map((p) => p.id)).not.toContain(f.b);
    get(s, f.c).spectator = true;
    expect(eligiblePartners(s, owner).map((p) => p.id)).not.toContain(f.c);
    s.game!.coops.push({
      id: 'k',
      ownerId: f.a,
      assignedId: f.imp,
      ownerTaskId: 'o',
      partnerTaskId: 'p',
      lat: 0,
      lng: 0,
      expiresAtGameMs: 1,
      phase: 'idle',
      done: [],
      lockedUntilGameMs: {},
    });
    expect(eligiblePartners(s, owner).map((p) => p.id)).not.toContain(f.imp);
  });

  it('keeps the owner card in a normal slot count (3) and puts the partner card in the extra slot', () => {
    const { state } = toPlaying(
      newLobby({ players: 8, config: { minigamesEnabled: ['wires'], coopChance: 1 } }),
    );
    for (const p of crewOf(state)) {
      expect(p.tasks).toHaveLength(CFG.taskSlots);
      expect(heldTasks(p).length).toBe(CFG.taskSlots + (p.partnerTask ? 1 : 0));
    }
  });
});

describe('co-op session (10.2, TASKS §5.4)', () => {
  it('start needs the pin revealed and the player within reach', () => {
    const f = ready();
    const p = pair(f.state, f.a, f.b, f.now);
    p.ownerCard.stage = 'assigned';
    expect(errCode(run0(p.state, start(f.a, p.ownerCard.id), f.now))).toBe('NOT_ALLOWED');
    p.ownerCard.stage = 'pin';
    // Everybody is at HOME, which is not the pin.
    expect(errCode(run0(p.state, start(f.a, p.ownerCard.id), f.now))).toBe('OUT_OF_RANGE');
  });

  it('the first at the pin opens a waiting session; a second starter is told it is busy', () => {
    const f = ready();
    const w = waiting(f, f.b);
    const c = sessionOf(w.state, w.session.id);
    expect(c).toMatchObject({ phase: 'waiting', starterId: f.a });
    // Starting again is a no-op for the starter and refused for the partner (they should join).
    expect(errCode(run0(w.state, start(f.a, w.ownerCard.id), w.now))).toBe('OK');
    expect(errCode(run0(w.state, start(f.b, w.partnerCard.id), w.now))).toBe('NOT_ALLOWED');
  });

  it('the assigned partner joins and each side gets only the PIN it shows', () => {
    const f = ready();
    const a = active(f, f.b);
    const c = sessionOf(a.state, a.session.id);
    expect(c.phase).toBe('active');
    expect(c.joinerId).toBe(f.b);
    expect(a.joinAck).toEqual({
      type: 'coopJoin',
      ack: { puzzle: { show: c.pins!.partner, digits: CFG.coopPinDigits } },
    });
    expect(Object.keys((a.joinAck as { ack: { puzzle: object } }).ack.puzzle).sort()).toEqual([
      'digits',
      'show',
    ]);
  });

  it('refuses a join from someone who is not assigned, and when the partner is out of reach', () => {
    const f = ready();
    const w = waiting(f, f.b);
    expect(errCode(run0(w.state, join(f.c, w.partnerCard.id), w.now))).toBe('NOT_FOUND');
    expect(errCode(run0(w.state, join(f.c, w.session.id), w.now))).toBe('NOT_ALLOWED');
    const far = moveTo(w.state, f.b, offsetByMeters(w.at, 0, 40), w.now);
    expect(errCode(run0(advanceTo(far, w.now + S), join(f.b, w.partnerCard.id), w.now + S))).toBe(
      'OUT_OF_RANGE',
    );
  });

  it('a partner who starts first is joined by the owner', () => {
    const f = ready();
    const p = pair(f.state, f.a, f.b, f.now);
    const at = pin(p.state, f.a);
    let s = gather(p.state, [f.a, f.b], at, f.now);
    s = run(s, start(f.b, p.partnerCard.id), f.now + 2 * S).state;
    expect(sessionOf(s, p.session.id)).toMatchObject({ phase: 'waiting', starterId: f.b });
    s = run(s, join(f.a, p.ownerCard.id), f.now + 2 * S).state;
    expect(sessionOf(s, p.session.id)).toMatchObject({ phase: 'active', joinerId: f.a });
  });

  it('a wrong PIN locks submitting, the right PINs from both complete it', () => {
    const f = ready();
    const a = active(f, f.b);
    const { pins } = sessionOf(a.state, a.session.id);
    let now = a.now;
    // Typing your own PIN is wrong.
    const wrong = run(a.state, submit(f.a, a.ownerCard.id, pins!.owner), now);
    expect(replyOf(wrong.effects)).toEqual({
      type: 'coopSubmit',
      ack: { result: 'wrong', points: 0 },
    });
    expect(errCode(run0(wrong.state, submit(f.a, a.ownerCard.id, pins!.partner), now))).toBe(
      'COOLDOWN',
    );
    now += (CFG.taskWrongLockoutS + 1) * S;
    let s = advanceTo(wrong.state, now);
    const first = run(s, submit(f.a, a.ownerCard.id, pins!.partner), now);
    expect(replyOf(first.effects)).toEqual({
      type: 'coopSubmit',
      ack: { result: 'waiting', points: 0 },
    });
    const done = run(first.state, submit(f.b, a.partnerCard.id, pins!.owner), now);
    expect(replyOf(done.effects)).toEqual({
      type: 'coopSubmit',
      ack: { result: 'success', points: CFG.coopPersonalPoints },
    });
    s = done.state;
    expect(s.game!.coops).toHaveLength(0);
  });

  it('rejects malformed PINs and submits from outside the session', () => {
    const f = ready();
    const a = active(f, f.b);
    expect(errCode(run0(a.state, { ...submit(f.a, a.ownerCard.id, '12') }, a.now))).toBe(
      'INVALID_PAYLOAD',
    );
    expect(errCode(run0(a.state, submit(f.c, a.ownerCard.id, '1234'), a.now))).toBe('NOT_ALLOWED');
    expect(errCode(run0(a.state, submit(f.a, 'wrong-id', '1234'), a.now))).toBe('NOT_ALLOWED');
  });

  it('walking more than 10 m beyond reach drops the joiner back to waiting; the starter leaving makes it idle', () => {
    const f = ready();
    const a = active(f, f.b);
    const beyond = CFG.reachRadiusM + CFG.taskAbandonExtraM + 5;
    const away = offsetByMeters(a.at, 0, beyond);
    const tele = run(
      a.state,
      { type: 'teleport', playerId: f.b, lat: away.lat, lng: away.lng },
      a.now,
    );
    const res = advanceWithEffects(tele.state, a.now + S);
    res.effects.push(...tele.effects);
    let s: RoomState;
    expect(sessionOf(res.state, a.session.id)).toMatchObject({ phase: 'waiting', starterId: f.a });
    expect(sessionOf(res.state, a.session.id).joinerId).toBeUndefined();
    expect(eventsTo(res.effects, f.a)).toContainEqual({ type: 'task.reset', reason: 'range' });
    expect(eventsTo(res.effects, f.b)).toContainEqual({ type: 'task.reset', reason: 'range' });
    s = moveTo(res.state, f.a, offsetByMeters(a.at, beyond, 0), a.now + S);
    s = advanceTo(s, a.now + 2 * S);
    expect(sessionOf(s, a.session.id)).toMatchObject({ phase: 'idle' });
  });

  it('cancel: the joiner steps out (back to waiting) and the starter ends the wait', () => {
    const f = ready();
    const a = active(f, f.b);
    let s = run(a.state, { type: 'coopCancel', playerId: f.b, taskId: a.partnerCard.id }).state;
    expect(sessionOf(s, a.session.id).phase).toBe('waiting');
    s = run(s, { type: 'coopCancel', playerId: f.a, taskId: a.ownerCard.id }).state;
    expect(sessionOf(s, a.session.id).phase).toBe('idle');
    expect(
      errCode(run0(s, { type: 'coopCancel', playerId: f.a, taskId: a.ownerCard.id }, a.now)),
    ).toBe('NOT_FOUND');
  });

  it('a Task Stop resets a running puzzle to waiting and blocks co-op commands while it lasts (E11)', () => {
    const f = ready();
    const a = active(f, f.b);
    const stopper = get(a.state, f.imp);
    expect(stopper.abilities?.taskStop).toBeDefined();
    const res = run(a.state, { type: 'abilityTaskStop', playerId: f.imp }, a.now);
    const c = sessionOf(res.state, a.session.id);
    expect(c).toMatchObject({ phase: 'waiting', starterId: f.a });
    expect(eventsTo(res.effects, f.a)).toContainEqual({ type: 'task.reset', reason: 'sabotage' });
    expect(eventsTo(res.effects, f.b)).toContainEqual({ type: 'task.reset', reason: 'sabotage' });
    expect(errCode(run0(res.state, join(f.b, a.partnerCard.id), a.now))).toBe('TASKS_LOCKED');
  });

  it('a meeting resets a running puzzle to waiting (E22)', () => {
    const f = ready({ meetingStartGraceS: 0 });
    const a = active(f, f.b);
    const res = run(a.state, { type: 'meetingCall', playerId: f.c }, a.now);
    expect(sessionOf(res.state, a.session.id).phase).toBe('waiting');
    expect(eventsTo(res.effects, f.b)).toContainEqual({ type: 'task.reset', reason: 'meeting' });
    expect(errCode(run0(res.state, join(f.b, a.partnerCard.id), a.now))).toBe('MEETING_ACTIVE');
  });

  it('expires after coopExpiryS of game time: both cards go with "expired" and the owner gets a new task', () => {
    const f = ready();
    const p = pair(f.state, f.a, f.b, f.now);
    const before = get(p.state, f.a).tasks!.map((t) => t.id);
    const at = f.now + CFG.coopExpiryS * S + S;
    const res = advanceWithEffects(p.state, at);
    expect(res.state.game!.coops).toHaveLength(0);
    expect(get(res.state, f.b).partnerTask).toBeUndefined();
    const owner = get(res.state, f.a);
    expect(owner.tasks).toHaveLength(CFG.taskSlots);
    expect(owner.tasks!.map((t) => t.id)).not.toContain(before[0]);
    expect(eventsTo(res.effects, f.a)).toContainEqual({ type: 'task.expired' });
    expect(eventsTo(res.effects, f.b)).toContainEqual({ type: 'task.expired' });
  });

  it('E20: an ejected partner expires the task for the owner, who gets a new one; an ejected owner expires the partner card', () => {
    const f = ready();
    const p = pair(f.state, f.a, f.b, f.now);
    const s1 = structuredClone(p.state);
    get(s1, f.b).spectator = true;
    delete get(s1, f.b).partnerTask;
    const r1 = advanceWithEffects(s1, f.now + 2 * S);
    expect(r1.state.game!.coops).toHaveLength(0);
    expect(eventsTo(r1.effects, f.a)).toContainEqual({ type: 'task.expired' });
    expect(get(r1.state, f.a).tasks).toHaveLength(CFG.taskSlots);
    const s2 = structuredClone(p.state);
    get(s2, f.a).spectator = true;
    delete get(s2, f.a).tasks;
    const r2 = advanceWithEffects(s2, f.now + 2 * S);
    expect(get(r2.state, f.b).partnerTask).toBeUndefined();
    expect(eventsTo(r2.effects, f.b)).toContainEqual({ type: 'task.expired' });
  });

  it('E20: a partner disconnected for forfeitAfterS expires it; a short drop does not', () => {
    const f = ready();
    const p = pair(f.state, f.a, f.b, f.now);
    let s = run(p.state, { type: 'disconnect', playerId: f.b }, f.now).state;
    s = advanceTo(s, f.now + 30 * S);
    expect(s.game!.coops).toHaveLength(1);
    const long = f.now + (CFG.forfeitAfterS + 5) * S;
    s = advanceWithEffects(s, long).state;
    expect(s.game!.coops).toHaveLength(0);
  });

  it('E21: an infected or exposed partner does not change the task', () => {
    const f = ready();
    const a = active(f, f.b);
    get(a.state, f.b).infection = 'infected';
    const { pins } = sessionOf(a.state, a.session.id);
    let s = run(a.state, submit(f.a, a.ownerCard.id, pins!.partner), a.now).state;
    s = run(s, submit(f.b, a.partnerCard.id, pins!.owner), a.now).state;
    expect(s.game!.coops).toHaveLength(0);
    expect(s.game!.teamScore).toBe(CFG.points.coop_pin);
  });

  it('reroll of the owner card closes the partner copy; a partner cannot reroll the request', () => {
    const f = ready();
    const p = pair(f.state, f.a, f.b, f.now);
    expect(
      errCode(
        run0(p.state, { type: 'taskReroll', playerId: f.b, taskId: p.partnerCard.id }, f.now),
      ),
    ).toBe('NOT_ALLOWED');
    const res = run(p.state, { type: 'taskReroll', playerId: f.a, taskId: p.ownerCard.id }, f.now);
    expect(res.state.game!.coops).toHaveLength(0);
    expect(get(res.state, f.b).partnerTask).toBeUndefined();
    expect(eventsTo(res.effects, f.b)).toContainEqual({ type: 'task.expired' });
    expect(eventsTo(res.effects, f.a)).not.toContainEqual({ type: 'task.expired' });
  });

  it('reporting the pin unsafe closes the session for both and disables the point', () => {
    const f = ready();
    const p = pair(f.state, f.a, f.b, f.now);
    const res = run(
      p.state,
      { type: 'taskReportUnsafe', playerId: f.b, taskId: p.partnerCard.id },
      f.now,
    );
    expect(res.state.game!.coops).toHaveLength(0);
    expect(get(res.state, f.a).tasks!.every((t) => t.id !== p.ownerCard.id)).toBe(true);
    expect(eventsTo(res.effects, f.a)).toContainEqual({ type: 'task.expired' });
  });

  it('an imposter partner card goes through the same reveal and can start a session', () => {
    const f = ready();
    const p = pair(f.state, f.a, f.imp, f.now);
    expect(get(p.state, f.imp).tasks).toBeUndefined();
    const at = pin(p.state, f.a);
    let s = gather(p.state, [f.a, f.imp], at, f.now);
    s = run(s, start(f.imp, p.partnerCard.id), f.now + 2 * S).state;
    expect(sessionOf(s, p.session.id)).toMatchObject({ phase: 'waiting', starterId: f.imp });
    s = run(s, join(f.a, p.ownerCard.id), f.now + 2 * S).state;
    expect(sessionOf(s, p.session.id).phase).toBe('active');
  });
});

describe('crediting and recovery (10.4, SCORING › Co-op crediting)', () => {
  function finish(
    state: RoomState,
    session: CoopSession,
    ownerCardId: string,
    partnerId: string,
    partnerCardId: string,
    now: number,
  ) {
    const { pins } = sessionOf(state, session.id);
    const r1 = run(state, submit(session.ownerId, ownerCardId, pins!.partner), now);
    return run(r1.state, submit(partnerId, partnerCardId, pins!.owner), now);
  }

  it('crew + crew: the team gets 12 and each gets 6; each participant is credited once', () => {
    const f = ready();
    const a = active(f, f.b);
    const res = finish(a.state, a.session, a.ownerCard.id, f.b, a.partnerCard.id, a.now);
    expect(res.state.game!.teamScore).toBe(CFG.points.coop_pin);
    expect(get(res.state, f.a).personalScore).toBe(CFG.coopPersonalPoints);
    expect(get(res.state, f.b).personalScore).toBe(CFG.coopPersonalPoints);
    expect(eventsTo(res.effects, f.a)).toContainEqual({ type: 'task.completed', points: 6 });
    expect(get(res.state, f.b).partnerTask).toBeUndefined();
    expect(get(res.state, f.a).tasks).toHaveLength(CFG.taskSlots);
    // The session is gone, so a repeat credits nothing.
    const again = run0(res.state, submit(f.a, a.ownerCard.id, '0000'), a.now);
    expect(errCode(again)).toBe('NOT_ALLOWED');
    expect(res.state.game!.teamScore).toBe(CFG.points.coop_pin);
  });

  it('crew + assigned imposter (E17): team 12, crew 6, imposter 0, and cooldown recovery 50% then 25% then none', () => {
    const f = ready();
    let state = f.state;
    let now = f.now;
    const remainingOf = (s: RoomState, at: number) =>
      get(s, f.imp).abilities!.taskStop!.readyAtGameMs - gameNow(s.game!.clock, at);
    // Keep the cooldown long so every recovery is measurable.
    get(state, f.imp).abilities!.taskStop!.readyAtGameMs += 1000 * S;
    const fractions: number[] = [];
    for (let i = 0; i < 3; i++) {
      const before = remainingOf(state, now);
      const p = pair(state, f.a, f.imp, now);
      const at = pin(p.state, f.a);
      let s = gather(p.state, [f.a, f.imp], at, now);
      now += S;
      s = run(s, start(f.a, p.ownerCard.id), now).state;
      s = run(s, join(f.imp, p.partnerCard.id), now).state;
      const res = finish(s, p.session, p.ownerCard.id, f.imp, p.partnerCard.id, now);
      expect(get(res.state, f.imp).personalScore ?? 0).toBe(0);
      expect(get(res.state, f.a).personalScore).toBe((i + 1) * CFG.coopPersonalPoints);
      expect(res.state.game!.teamScore).toBe((i + 1) * CFG.points.coop_pin);
      fractions.push(1 - remainingOf(res.state, now) / before);
      state = res.state;
      now += S;
      state = advanceTo(state, now);
    }
    expect(fractions[0]).toBeCloseTo(CFG.coopRecoveryFirst, 1);
    expect(fractions[1]).toBeCloseTo(CFG.coopRecoverySecond, 1);
    expect(fractions[2]).toBeCloseTo(0, 1);
  });

  it('recovery is tracked per crew partner: a different crew member starts again at 50%', () => {
    const f = ready();
    const s0 = structuredClone(f.state);
    s0.game!.coopPairs[`${f.imp}|${f.a}`] = 2;
    get(s0, f.imp).abilities!.taskStop!.readyAtGameMs += 1000 * S;
    const p = pair(s0, f.b, f.imp, f.now);
    const at = pin(p.state, f.b);
    let s = gather(p.state, [f.b, f.imp], at, f.now);
    s = run(s, start(f.b, p.ownerCard.id), f.now + S).state;
    s = run(s, join(f.imp, p.partnerCard.id), f.now + S).state;
    const before = get(s, f.imp).abilities!.taskStop!.readyAtGameMs;
    const res = finish(s, p.session, p.ownerCard.id, f.imp, p.partnerCard.id, f.now + S);
    const gameMs = gameNow(res.state.game!.clock, f.now + S);
    const after = get(res.state, f.imp).abilities!.taskStop!.readyAtGameMs;
    expect((after - gameMs) / (before - gameMs)).toBeCloseTo(1 - CFG.coopRecoveryFirst, 1);
  });

  it('Infect is not touched by recovery', () => {
    const f = ready();
    const s0 = structuredClone(f.state);
    get(s0, f.imp).infect!.readyAtGameMs += 500 * S;
    const infectReady = get(s0, f.imp).infect!.readyAtGameMs;
    const p = pair(s0, f.a, f.imp, f.now);
    const at = pin(p.state, f.a);
    let s = gather(p.state, [f.a, f.imp], at, f.now);
    s = run(s, start(f.a, p.ownerCard.id), f.now + S).state;
    s = run(s, join(f.imp, p.partnerCard.id), f.now + S).state;
    const res = finish(s, p.session, p.ownerCard.id, f.imp, p.partnerCard.id, f.now + S);
    expect(get(res.state, f.imp).infect!.readyAtGameMs).toBe(infectReady);
  });
});

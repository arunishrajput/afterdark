import { offsetByMeters } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { gameNow } from '../clock';
import {
  CFG,
  eventsTo,
  gather,
  get,
  join,
  pair,
  passTime,
  pin,
  ready,
  replyOf,
  run0,
  sessionOf,
  start,
  submit,
} from '../coopKit';
import { advanceTo, advanceWithEffects, errCode, run, S } from '../testkit';
import { camouflageEndsGameMs, isCamouflaged } from './camouflage';

const camo = (id: string) => ({ type: 'abilityCamouflage' as const, playerId: id });

describe('Camouflage ability (10.5, RULES §7.4)', () => {
  it('starts the disguise for camouflageDurationS and the cooldown for camouflageCooldownS', () => {
    const f = ready();
    const res = run(f.state, camo(f.imp), f.now);
    const me = get(res.state, f.imp);
    const gameMs = gameNow(res.state.game!.clock, f.now);
    expect(me.abilities!.camouflage!.activeUntilGameMs).toBe(gameMs + CFG.camouflageDurationS * S);
    expect(me.abilities!.camouflage!.readyAtGameMs).toBe(gameMs + CFG.camouflageCooldownS * S);
    expect(replyOf(res.effects)).toEqual({
      type: 'camouflage',
      ack: { endsAt: f.now + CFG.camouflageDurationS * S },
    });
    expect(isCamouflaged(res.state, me, f.now + 10 * S)).toBe(true);
  });

  it('ends after the duration when no co-op is running', () => {
    const f = ready();
    const s = run(f.state, camo(f.imp), f.now).state;
    expect(isCamouflaged(s, get(s, f.imp), f.now + (CFG.camouflageDurationS - 1) * S)).toBe(true);
    expect(isCamouflaged(s, get(s, f.imp), f.now + (CFG.camouflageDurationS + 1) * S)).toBe(false);
  });

  it('is refused on cooldown, for a crew member, and for an imposter without the class ability', () => {
    const f = ready();
    const used = passTime(run(f.state, camo(f.imp), f.now).state, f.now, 50);
    expect(errCode(run0(used, camo(f.imp), f.now + 50 * S))).toBe('COOLDOWN');
    expect(errCode(run0(f.state, camo(f.a), f.now))).toBe('NOT_ALLOWED');
    const s = structuredClone(f.state);
    delete get(s, f.imp).abilities!.camouflage;
    expect(errCode(run0(s, camo(f.imp), f.now))).toBe('NOT_ALLOWED');
  });

  it('leaves Infect available and changes nothing about any other player', () => {
    const f = ready();
    const res = run(f.state, camo(f.imp), f.now);
    for (const p of f.state.players) {
      if (p.id === f.imp) continue;
      expect(get(res.state, p.id)).toEqual(p);
    }
    expect(get(res.state, f.imp).infect).toEqual(get(f.state, f.imp).infect);
    expect({ ...res.state.game!, clock: null }).toEqual({ ...f.state.game!, clock: null });
  });

  it('a meeting ends it (ADR-084)', () => {
    const f = ready({ meetingStartGraceS: 0 });
    let s = run(f.state, camo(f.imp), f.now).state;
    s = run(s, { type: 'meetingCall', playerId: f.a }, f.now + S).state;
    expect(get(s, f.imp).abilities!.camouflage!.activeUntilGameMs).toBeUndefined();
  });

  it('an ejected imposter is no longer disguised', () => {
    const f = ready();
    const s = run(f.state, camo(f.imp), f.now).state;
    get(s, f.imp).spectator = true;
    expect(isCamouflaged(s, get(s, f.imp), f.now + S)).toBe(false);
  });
});

/** The owner waits at the pin; the imposter (disguised or not) stands beside them. */
function standInSetup(disguise: boolean) {
  const f = ready();
  let state = f.state;
  if (disguise) state = run(state, camo(f.imp), f.now).state;
  const p = pair(state, f.a, f.b, f.now);
  const at = pin(p.state, f.a);
  let s = gather(p.state, [f.a, f.imp, f.b], at, f.now);
  const now = f.now + 2 * S;
  s = run(s, start(f.a, p.ownerCard.id), now).state;
  return { f, p, s, at, now };
}

describe('stand-in (10.2, 10.4, RULES §7.4, E18, ADR-005)', () => {
  it('a camouflaged imposter joins the waiting owner as the partner, with the join id', () => {
    const { f, p, s, now } = standInSetup(true);
    const res = run(s, join(f.imp, p.session.id), now);
    expect(sessionOf(res.state, p.session.id)).toMatchObject({ phase: 'active', joinerId: f.imp });
    // The real partner cannot take the seat any more (E18).
    expect(errCode(run0(res.state, join(f.b, p.partnerCard.id), now))).toBe('NOT_ALLOWED');
  });

  it('an imposter who is not camouflaged cannot stand in, and neither can a crew member', () => {
    const plain = standInSetup(false);
    expect(errCode(run0(plain.s, join(plain.f.imp, plain.p.session.id), plain.now))).toBe(
      'NOT_ALLOWED',
    );
    expect(errCode(run0(plain.s, join(plain.f.c, plain.p.session.id), plain.now))).toBe(
      'NOT_ALLOWED',
    );
  });

  it('cannot join when the real partner started the wait (the owner is not the waiting one)', () => {
    const f = ready();
    const s0 = run(f.state, camo(f.imp), f.now).state;
    const p = pair(s0, f.a, f.b, f.now);
    const at = pin(p.state, f.a);
    let s = gather(p.state, [f.a, f.imp, f.b], at, f.now);
    s = run(s, start(f.b, p.partnerCard.id), f.now + 2 * S).state;
    expect(errCode(run0(s, join(f.imp, p.session.id), f.now + 2 * S))).toBe('NOT_ALLOWED');
  });

  it('needs the imposter within reach of the pin', () => {
    const { f, p, s, at, now } = standInSetup(true);
    const far = run(
      s,
      { type: 'teleport', playerId: f.imp, ...offsetByMeters(at, 0, 60) },
      now,
    ).state;
    expect(errCode(run0(advanceTo(far, now + S), join(f.imp, p.session.id), now + S))).toBe(
      'OUT_OF_RANGE',
    );
  });

  it('credits the owner exactly like a real partner and closes the real partner’s copy as expired', () => {
    const real = standInSetup(false);
    const realJoin = run(real.s, join(real.f.b, real.p.partnerCard.id), real.now);
    const pinsReal = sessionOf(realJoin.state, real.p.session.id).pins!;
    const r1 = run(
      realJoin.state,
      submit(real.f.a, real.p.ownerCard.id, pinsReal.partner),
      real.now,
    );
    const realDone = run(
      r1.state,
      submit(real.f.b, real.p.partnerCard.id, pinsReal.owner),
      real.now,
    );

    const stand = standInSetup(true);
    const standJoin = run(stand.s, join(stand.f.imp, stand.p.session.id), stand.now);
    const pinsStand = sessionOf(standJoin.state, stand.p.session.id).pins!;
    const s1 = run(
      standJoin.state,
      submit(stand.f.a, stand.p.ownerCard.id, pinsStand.partner),
      stand.now,
    );
    const standDone = run(
      s1.state,
      submit(stand.f.imp, stand.p.session.id, pinsStand.owner),
      stand.now,
    );

    const ownerA = (r: typeof realDone, id: string) => ({
      team: r.state.game!.teamScore,
      personal: get(r.state, id).personalScore,
      events: eventsTo([...r1.effects, ...r.effects], id).map((e) => e.type),
      slots: get(r.state, id).tasks!.length,
      sessions: r.state.game!.coops.length,
    });
    // The owner's side is identical whoever completed it.
    expect(ownerA(standDone, stand.f.a)).toEqual({
      ...ownerA(realDone, real.f.a),
      events: ownerA(realDone, real.f.a).events.filter((t) => t !== undefined),
    });
    expect(standDone.state.game!.teamScore).toBe(CFG.points.coop_pin);
    expect(get(standDone.state, stand.f.a).personalScore).toBe(CFG.coopPersonalPoints);
    // The imposter earns nothing but recovers cooldown; the real partner's card closes as an ordinary expiry.
    expect(get(standDone.state, stand.f.imp).personalScore ?? 0).toBe(0);
    expect(get(standDone.state, stand.f.b).partnerTask).toBeUndefined();
    expect(eventsTo([...s1.effects, ...standDone.effects], stand.f.b)).toContainEqual({
      type: 'task.expired',
    });
    expect(eventsTo([...r1.effects, ...realDone.effects], real.f.b)).not.toContainEqual({
      type: 'task.expired',
    });
    expect(get(standDone.state, stand.f.b).personalScore ?? 0).toBe(0);
  });

  it('recovers the imposter’s cooldown for a stand-in too, tracked against the owner', () => {
    const { f, p, s, now } = standInSetup(true);
    get(s, f.imp).abilities!.taskStop!.readyAtGameMs += 1000 * S;
    const before = get(s, f.imp).abilities!.taskStop!.readyAtGameMs - gameNow(s.game!.clock, now);
    const j = run(s, join(f.imp, p.session.id), now);
    const { pins } = sessionOf(j.state, p.session.id);
    const a = run(j.state, submit(f.a, p.ownerCard.id, pins!.partner), now);
    const done = run(a.state, submit(f.imp, p.session.id, pins!.owner), now);
    const after =
      get(done.state, f.imp).abilities!.taskStop!.readyAtGameMs -
      gameNow(done.state.game!.clock, now);
    expect(after / before).toBeCloseTo(1 - CFG.coopRecoveryFirst, 1);
    expect(done.state.game!.coopPairs[`${f.imp}|${f.a}`]).toBe(1);
  });
});

describe('camouflage extension through a co-op (E19)', () => {
  function inSession() {
    const { f, p, s, now } = standInSetup(true);
    const j = run(s, join(f.imp, p.session.id), now);
    return { f, p, state: j.state, now };
  }

  it('lasts past camouflageDurationS while the imposter is in the session', () => {
    const { f, state, now } = inSession();
    const afterBase = now + (CFG.camouflageDurationS + 20) * S;
    const s = passTime(state, now, CFG.camouflageDurationS + 20);
    expect(sessionOf(s, state.game!.coops[0]!.id).phase).toBe('active');
    expect(isCamouflaged(s, get(s, f.imp), afterBase)).toBe(true);
  });

  it('is capped at camouflageCoopExtensionMaxS beyond the original end', () => {
    const { f, state, now } = inSession();
    const until = get(state, f.imp).abilities!.camouflage!.activeUntilGameMs!;
    const at = now + until - gameNow(state.game!.clock, now);
    expect(camouflageEndsGameMs(state, get(state, f.imp), at - S)).toBe(until);
    const inExt = camouflageEndsGameMs(state, get(state, f.imp), at + 5 * S);
    expect(inExt).toBe(until + CFG.camouflageCoopExtensionMaxS * S);
    const past = at + (CFG.camouflageCoopExtensionMaxS + 5) * S;
    expect(camouflageEndsGameMs(state, get(state, f.imp), past)).toBeUndefined();
  });

  it('ends as soon as the session does', () => {
    const { f, p, state, now } = inSession();
    const afterBase = now + (CFG.camouflageDurationS + 20) * S;
    let s = passTime(state, now, CFG.camouflageDurationS + 20);
    const { pins } = sessionOf(s, p.session.id);
    s = run(s, submit(f.a, p.ownerCard.id, pins!.partner), afterBase).state;
    s = run(s, submit(f.imp, p.session.id, pins!.owner), afterBase).state;
    expect(isCamouflaged(s, get(s, f.imp), afterBase)).toBe(false);
  });

  it('a waiting session counts too: an assigned disguised imposter who started it keeps the disguise', () => {
    const f = ready();
    const s0 = run(f.state, camo(f.imp), f.now).state;
    const p = pair(s0, f.a, f.imp, f.now);
    const at = pin(p.state, f.a);
    let s = gather(p.state, [f.a, f.imp], at, f.now);
    s = run(s, start(f.imp, p.partnerCard.id), f.now + 2 * S).state;
    const later = f.now + (CFG.camouflageDurationS + 10) * S;
    s = passTime(s, f.now + 2 * S, CFG.camouflageDurationS + 8);
    expect(sessionOf(s, p.session.id).phase).toBe('waiting');
    expect(isCamouflaged(s, get(s, f.imp), later)).toBe(true);
  });

  it('a stand-in who strays loses the session but the owner keeps waiting', () => {
    const { f, p, state, now } = inSession();
    const away = offsetByMeters(pin(state, f.a), 0, CFG.reachRadiusM + CFG.taskAbandonExtraM + 10);
    const tele = run(state, { type: 'teleport', playerId: f.imp, ...away }, now);
    const res = advanceWithEffects(tele.state, now + S);
    expect(sessionOf(res.state, p.session.id)).toMatchObject({ phase: 'waiting', starterId: f.a });
  });
});

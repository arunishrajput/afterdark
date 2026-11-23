/**
 * Leak tests for co-op tasks and Camouflage (TESTING.md §3, Phase 10): a partner's
 * tag reaches only the two participants, a stand-in's completion looks exactly like
 * a real partner's to the owner, a disguise changes nobody else's view, and decoy
 * cards never reuse a real id or a real pin.
 */
import { describe, expect, it } from 'vitest';

import {
  CFG,
  eventsTo,
  gather,
  get,
  imposters,
  join,
  pair,
  pin,
  ready,
  sessionOf,
  start,
  submit,
} from '../engine/coopKit';
import type { RoomState } from '../engine/state';
import { advanceTo, crewOf, run, S } from '../engine/testkit';
import { ALLOWED_VIEW_KEYS, keysDeep } from './leakHarness';
import { projectView } from './projectView';

const camo = (id: string) => ({ type: 'abilityCamouflage' as const, playerId: id });
const raw = (state: RoomState, id: string, now: number) =>
  JSON.stringify(projectView(state, id, now));

/** Owner A waits at a pin; the partner (real) or the camouflaged imposter (stand-in) joins. */
function scenario(standIn: boolean) {
  const f = ready();
  let state = standIn ? run(f.state, camo(f.imp), f.now).state : f.state;
  const p = pair(state, f.a, f.b, f.now);
  const at = pin(p.state, f.a);
  state = gather(p.state, [f.a, f.b, f.imp], at, f.now);
  const now = f.now + 2 * S;
  state = run(state, start(f.a, p.ownerCard.id), now).state;
  const waiting = state;
  const joined = run(state, standIn ? join(f.imp, p.session.id) : join(f.b, p.partnerCard.id), now);
  const { pins } = sessionOf(joined.state, p.session.id);
  const first = run(joined.state, submit(f.a, p.ownerCard.id, pins!.partner), now);
  const doneRes = run(
    first.state,
    standIn ? submit(f.imp, p.session.id, pins!.owner) : submit(f.b, p.partnerCard.id, pins!.owner),
    now,
  );
  return {
    f,
    p,
    now,
    waiting,
    active: joined.state,
    done: doneRes.state,
    pins: pins!,
    first,
    doneRes,
    joined,
  };
}

describe('leak: co-op views', () => {
  it('every view at every stage uses only allowed keys, and crew views never grow an imposter block', () => {
    for (const standIn of [false, true]) {
      const s = scenario(standIn);
      for (const [name, state] of [
        ['waiting', s.waiting],
        ['active', s.active],
        ['done', s.done],
      ] as const) {
        for (const pl of state.players) {
          const view = projectView(state, pl.id, s.now);
          for (const k of keysDeep(view).filter((x) => !x.startsWith('lobby.config.'))) {
            expect(ALLOWED_VIEW_KEYS, `${name}: unexpected key ${k}`).toContain(k);
          }
          if (pl.role === 'crew') expect(JSON.stringify(view)).not.toContain('"imposter"');
        }
      }
    }
  });

  it('the partner tag appears only in the two participants’ own views (and an imposter’s ally list)', () => {
    for (const standIn of [false, true]) {
      const s = scenario(standIn);
      const tagA = get(s.active, s.f.a).tag!;
      const tagB = get(s.active, s.f.b).tag!;
      for (const pl of s.active.players) {
        const json = raw(s.active, pl.id, s.now);
        // Both assigned players hold a card naming the other; a stand-in holds none, so learns neither tag.
        const mayKnow = pl.id === s.f.a || pl.id === s.f.b;
        expect(json.includes(`"${tagA}"`), `A's tag in ${pl.id} (standIn=${standIn})`).toBe(
          mayKnow,
        );
        expect(json.includes(`"${tagB}"`), `B's tag in ${pl.id} (standIn=${standIn})`).toBe(
          mayKnow,
        );
      }
    }
  });

  it('the partner card carries the owner’s tag and the owner’s card the partner’s', () => {
    const s = scenario(false);
    const a = projectView(s.waiting, s.f.a, s.now).game?.tasks?.find(
      (t) => t.id === s.p.ownerCard.id,
    );
    const b = projectView(s.waiting, s.f.b, s.now).game?.tasks?.find(
      (t) => t.id === s.p.partnerCard.id,
    );
    expect(a).toMatchObject({ kind: 'coop', partnerTag: get(s.waiting, s.f.b).tag });
    expect(b).toMatchObject({ kind: 'coop', partnerTag: get(s.waiting, s.f.a).tag });
    // The waiting owner is visible to the partner as "waiting", never to a bystander.
    expect(b).toMatchObject({ partnerWaiting: true });
    expect(a).toMatchObject({ partnerWaiting: false });
  });

  it('each participant gets only the PIN they show', () => {
    const s = scenario(false);
    const va = projectView(s.active, s.f.a, s.now).game?.coop;
    const vb = projectView(s.active, s.f.b, s.now).game?.coop;
    expect(va).toMatchObject({ phase: 'active', puzzle: { show: s.pins.owner } });
    expect(vb).toMatchObject({ phase: 'active', puzzle: { show: s.pins.partner } });
    expect(raw(s.active, s.f.a, s.now)).not.toContain(`"${s.pins.partner}"`);
    expect(raw(s.active, s.f.b, s.now)).not.toContain(`"${s.pins.owner}"`);
    for (const pl of s.active.players) {
      if (pl.id === s.f.a || pl.id === s.f.b) continue;
      expect(projectView(s.active, pl.id, s.now).game?.coop).toBeUndefined();
      const json = raw(s.active, pl.id, s.now);
      expect(json).not.toContain(`"${s.pins.owner}"`);
      expect(json).not.toContain(`"${s.pins.partner}"`);
    }
  });

  it('the owner’s view and events after a stand-in completion match those after a real partner’s', () => {
    const real = scenario(false);
    const stand = scenario(true);
    const eventKinds = (s: ReturnType<typeof scenario>) =>
      eventsTo([...s.first.effects, ...s.doneRes.effects], s.f.a).map((e) => e.type);
    expect(eventKinds(stand)).toEqual(eventKinds(real));
    for (const key of ['waiting', 'active', 'done'] as const) {
      const vr = projectView(real[key], real.f.a, real.now);
      const vs = projectView(stand[key], stand.f.a, stand.now);
      expect(keysDeep(vs.game), key).toEqual(keysDeep(vr.game));
      expect(keysDeep(vs.me), key).toEqual(keysDeep(vr.me));
    }
    expect(projectView(stand.done, stand.f.a, stand.now).game?.teamScore).toBe(
      projectView(real.done, real.f.a, real.now).game?.teamScore,
    );
    expect(projectView(stand.done, stand.f.a, stand.now).me.personalScore).toBe(
      CFG.coopPersonalPoints,
    );
  });

  it('the stand-in gets the same view shape as a real partner (a session with a PIN, no card for it)', () => {
    const stand = scenario(true);
    const v = projectView(stand.active, stand.f.imp, stand.now);
    expect(v.game?.coop).toMatchObject({ taskId: stand.p.session.id, phase: 'active' });
    expect(keysDeep(v.game?.coop)).toEqual(
      keysDeep(projectView(scenario(false).active, stand.f.a, stand.now).game?.coop),
    );
  });
});

describe('leak: Camouflage changes only the imposter’s own view', () => {
  it('no other crew view changes at all, and an ally sees only the cooldown and end time', () => {
    const f = ready();
    const before = f.state;
    const after = run(before, camo(f.imp), f.now).state;
    for (const pl of before.players) {
      if (pl.id === f.imp) continue;
      const vb = projectView(before, pl.id, f.now);
      const va = projectView(after, pl.id, f.now);
      if (pl.role === 'crew') {
        expect(va).toEqual(vb);
      } else {
        expect(keysDeep({ ...va, me: { ...va.me, imposter: undefined } })).toEqual(
          keysDeep({ ...vb, me: { ...vb.me, imposter: undefined } }),
        );
        const ally = va.me.imposter?.allies.find((x) => x.playerId === f.imp);
        expect(ally?.abilities.find((x) => x.id === 'camouflage')?.activeUntil).toBeDefined();
      }
    }
    // The radar is anonymous and unchanged too: disguising moves no dot and adds no flag.
    expect(JSON.stringify(after.players.map((p) => p.loc))).toBe(
      JSON.stringify(before.players.map((p) => p.loc)),
    );
  });

  it('the disguise block exists only while disguised, with 3 decoys and the end time', () => {
    const f = ready();
    expect(projectView(f.state, f.imp, f.now).me.imposter?.camouflage).toBeUndefined();
    const on = run(f.state, camo(f.imp), f.now).state;
    const view = projectView(on, f.imp, f.now).me.imposter?.camouflage;
    expect(view?.decoyTasks).toHaveLength(CFG.taskSlots);
    expect(view?.until).toBe(f.now + CFG.camouflageDurationS * S);
    const later = advanceTo(on, f.now + (CFG.camouflageDurationS + 2) * S);
    expect(
      projectView(later, f.imp, f.now + (CFG.camouflageDurationS + 2) * S).me.imposter?.camouflage,
    ).toBeUndefined();
  });

  it('decoys are stable across rebuilds and never a real id, pin, or fake', () => {
    for (const salt of ['x', 'y', 'z']) {
      const f = ready();
      void salt;
      const on = run(f.state, camo(f.imp), f.now).state;
      const one = projectView(on, f.imp, f.now).me.imposter!.camouflage!.decoyTasks;
      const two = projectView(on, f.imp, f.now + 3 * S).me.imposter!.camouflage!.decoyTasks;
      expect(two).toEqual(one);
      const real = new Set<string>();
      for (const p of on.players) {
        for (const t of p.tasks ?? []) real.add(t.id);
        if (p.partnerTask) real.add(p.partnerTask.id);
      }
      for (const c of on.game!.coops) real.add(c.id);
      for (const d of one) {
        expect(real.has(d.id)).toBe(false);
        expect(d.kind).toBe('solo');
        expect(d.id).toMatch(/^[A-Za-z0-9_-]{16}$/);
        if (d.stage === 'pin') {
          expect(on.setup.taskPoints.some((tp) => tp.lat === d.lat && tp.lng === d.lng)).toBe(
            false,
          );
          expect(d.atPin).toBe(false);
        }
      }
      expect(new Set(one.map((d) => d.id)).size).toBe(one.length);
    }
  });

  it('a decoy card has the same keys as a real card of the same stage', () => {
    const f = ready();
    const on = run(f.state, camo(f.imp), f.now).state;
    const decoys = projectView(on, f.imp, f.now).me.imposter!.camouflage!.decoyTasks;
    const realCard = projectView(on, f.a, f.now).game!.tasks![0]!;
    for (const d of decoys.filter((x) => x.stage === 'assigned')) {
      expect(keysDeep(d)).toEqual(keysDeep(realCard));
    }
  });

  it('only a disguised imposter beside a waiting owner is offered the stand-in seat', () => {
    const s = scenario(true);
    const waitingView = projectView(s.waiting, s.f.imp, s.now).me.imposter?.camouflage;
    expect(waitingView?.join).toEqual({ taskId: s.p.session.id });
    // Once the seat is taken, the offer goes.
    expect(projectView(s.active, s.f.imp, s.now).me.imposter?.camouflage?.join).toBeUndefined();
    // Not disguised: no block, so no offer.
    const plain = scenario(false);
    expect(
      projectView(plain.waiting, plain.f.imp, plain.now).me.imposter?.camouflage,
    ).toBeUndefined();
    // Crew and the second imposter never see an offer.
    for (const id of [
      s.f.c,
      ...imposters(s.waiting)
        .map((p) => p.id)
        .filter((x) => x !== s.f.imp),
    ]) {
      expect(raw(s.waiting, id, s.now)).not.toContain(s.p.session.id);
    }
    void crewOf;
  });

  it('an out-of-reach disguised imposter gets no offer', () => {
    const f = ready();
    const on = run(f.state, camo(f.imp), f.now).state;
    const p = pair(on, f.a, f.b, f.now);
    let s = gather(p.state, [f.a], pin(p.state, f.a), f.now);
    s = run(s, start(f.a, p.ownerCard.id), f.now + 2 * S).state;
    expect(projectView(s, f.imp, f.now + 2 * S).me.imposter?.camouflage?.join).toBeUndefined();
  });
});

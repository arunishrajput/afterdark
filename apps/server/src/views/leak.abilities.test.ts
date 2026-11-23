/**
 * Leak tests for the imposter abilities (TESTING.md §3, Phase 9): a fake task made
 * by the engine is indistinguishable from a real one at every stage and in its
 * open ack, the Phantom's fakes and every ability cooldown reach imposters only,
 * and a Task Stop lock is public and names nobody.
 */
import { offsetByMeters } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { reduce } from '../engine/reduce';
import type { PlayerState, RoomState } from '../engine/state';
import { initialAbilities } from '../engine/systems/abilities';
import { checkFakeTask } from '../engine/systems/fakeTask';
import {
  advanceTo,
  crewOf,
  newLobby,
  otherPointInSection,
  run,
  S,
  stayAt,
  taskAt,
  toPlaying,
} from '../engine/testkit';
import type { Effect } from '../engine/types';
import { keysDeep } from './leakHarness';
import { projectView } from './projectView';

const imposters = (s: RoomState) => s.players.filter((p) => p.role === 'imposter');
const get = (s: RoomState, id: string): PlayerState => s.players.find((p) => p.id === id)!;

function spotFor(state: RoomState, actor: PlayerState, skip = 0) {
  let seen = 0;
  for (let dx = -200; dx <= 200; dx += 15) {
    for (let dy = -200; dy <= 200; dy += 15) {
      const at = offsetByMeters({ lat: 28.6139, lng: 77.209 }, dx, dy);
      try {
        checkFakeTask(state, actor, at);
      } catch {
        continue;
      }
      if (seen++ === skip) return at;
    }
  }
  throw new Error('no spot');
}

/** Two imposters armed with both abilities, a fake of each planted, and one crew member holding the first fake. */
function scripted() {
  const start = toPlaying(newLobby({ players: 8, config: { minigamesEnabled: ['wires'] } }));
  let state = structuredClone(start.state);
  for (const p of imposters(state)) {
    p.classes = ['saboteur', 'phantom'];
    p.abilities = initialAbilities(state.config, p.classes);
  }
  const now = start.now + (state.config.abilityInitialCooldownS + 1) * S;
  state = advanceTo(state, now);
  const [a, b] = imposters(state);
  state = run(
    state,
    { type: 'abilityFakeTask', playerId: a!.id, at: spotFor(state, a!) },
    now,
  ).state;
  state = run(
    state,
    { type: 'abilityFakeTask', playerId: b!.id, at: spotFor(state, b!, 7) },
    now,
  ).state;
  const [holder, other] = crewOf(state);
  state = run(
    state,
    { type: 'taskReroll', playerId: holder!.id, taskId: taskAt(state, holder!.id, 0).id },
    now,
  ).state;
  return { state, now, a: a!, b: b!, holder: holder!, other: other! };
}

const replyOf = (effects: Effect[]) => {
  const e = effects.find((x) => x.kind === 'reply');
  return e && e.kind === 'reply' ? e.reply : undefined;
};

describe('leak: a fake task made by the engine looks like a real one', () => {
  it('has the same card keys at the assigned and the pin stage, and the same id format', () => {
    const f = scripted();
    const cards = projectView(f.state, f.holder.id, f.now).game?.tasks ?? [];
    const fakeCard = cards.find(
      (c) => c.id === get(f.state, f.holder.id).tasks!.find((t) => t.fake)?.id,
    );
    const realCard = cards.find((c) => c.id !== fakeCard?.id);
    expect(fakeCard).toBeDefined();
    expect(keysDeep(fakeCard)).toEqual(keysDeep(realCard));
    expect(fakeCard!.id).toMatch(/^[A-Za-z0-9_-]{16}$/);

    // Reveal the fake's pin through the real engine, then compare again.
    const fake = get(f.state, f.holder.id).tasks!.find((t) => t.fake)!;
    const held = stayAt(
      f.state,
      f.holder.id,
      otherPointInSection(f.state, fake),
      f.now,
      f.state.config.sectionEntryHoldS + 1,
    );
    const real = get(held.state, f.holder.id).tasks!.find((t) => !t.fake)!;
    const revealedReal = structuredClone(held.state);
    Object.assign(
      get(revealedReal, f.holder.id).tasks!.find((t) => t.id === real.id)!,
      {
        stage: 'pin',
      },
    );
    const pin = projectView(revealedReal, f.holder.id, held.now).game?.tasks ?? [];
    const pinFake = pin.find((c) => c.id === fake.id);
    const pinReal = pin.find((c) => c.id === real.id);
    expect(pinFake?.stage).toBe('pin');
    expect(keysDeep(pinFake)).toEqual(keysDeep(pinReal));
  });

  it('opens with an ack of the same shape as a real task of the same type', () => {
    const f = scripted();
    const fake = get(f.state, f.holder.id).tasks!.find((t) => t.fake)!;
    const held = stayAt(
      f.state,
      f.holder.id,
      otherPointInSection(f.state, fake),
      f.now,
      f.state.config.sectionEntryHoldS + 1,
    );
    const arrived = stayAt(held.state, f.holder.id, fake, held.now, 1);
    const fakeOpen = reduce(
      arrived.state,
      { type: 'taskOpen', playerId: f.holder.id, taskId: fake.id },
      arrived.now,
    );
    if (!fakeOpen.ok) throw new Error(fakeOpen.message);
    // A real task opened by the same player, as if it sat at the same pin.
    const real = structuredClone(arrived.state);
    const mine = get(real, f.holder.id).tasks!;
    const realTask = mine.find((t) => !t.fake)!;
    Object.assign(realTask, { stage: 'pin', lat: fake.lat, lng: fake.lng, atPin: true });
    const realOpen = reduce(
      real,
      { type: 'taskOpen', playerId: f.holder.id, taskId: realTask.id },
      arrived.now,
    );
    if (!realOpen.ok) throw new Error(realOpen.message);
    expect(keysDeep(replyOf(fakeOpen.effects))).toEqual(keysDeep(replyOf(realOpen.effects)));
    expect(JSON.stringify(replyOf(fakeOpen.effects))).not.toMatch(/fake|owner|solution/i);
  });

  it('nobody but the Phantom can tell: no crew or ally view mentions fakes, owners or the planter', () => {
    const f = scripted();
    for (const p of f.state.players) {
      const json = JSON.stringify(projectView(f.state, p.id, f.now));
      expect(json, `${p.id} mentions fake`).not.toMatch(/fakeOwner|ownerId|"fake"/);
    }
    // The crew holder's view names no imposter secret: no tag, no class, no ability.
    const holderJson = JSON.stringify(projectView(f.state, f.holder.id, f.now));
    for (const imp of imposters(f.state)) expect(holderJson).not.toContain(imp.tag ?? '#none#');
    expect(holderJson).not.toMatch(/saboteur|phantom|"taskStop"|"fakeTask"/);
  });
});

describe('leak: ability state is imposter-only', () => {
  it('a Phantom sees their own fakes (queued, then assigned) and an ally never sees them', () => {
    const f = scripted();
    const mineA = projectView(f.state, f.a.id, f.now).me.imposter;
    expect(mineA?.fakes).toHaveLength(1);
    expect(mineA?.fakes[0]).toMatchObject({ assigned: true });
    const mineB = projectView(f.state, f.b.id, f.now).me.imposter;
    expect(mineB?.fakes).toHaveLength(1);
    expect(mineB?.fakes[0]).toMatchObject({ assigned: false });
    expect(mineA?.fakes[0]?.id).not.toBe(mineB?.fakes[0]?.id);
    expect(JSON.stringify(projectView(f.state, f.a.id, f.now))).not.toContain(mineB!.fakes[0]!.id);
  });

  it('crew and spectators have no abilities, no fakes and no imposter block', () => {
    const f = scripted();
    for (const crew of crewOf(f.state)) {
      const view = projectView(f.state, crew.id, f.now);
      expect('imposter' in view.me).toBe(false);
      const names = keysDeep(view);
      expect(names.some((k) => /abilit|fakes/.test(k))).toBe(false);
    }
    const ejected = structuredClone(f.state);
    const imp = get(ejected, f.a.id);
    imp.spectator = true;
    delete imp.abilities;
    expect('imposter' in projectView(ejected, imp.id, f.now).me).toBe(false);
  });

  it('allies see each other’s cooldowns as deadlines, with the same structure as their own', () => {
    const f = scripted();
    const view = projectView(f.state, f.a.id, f.now).me.imposter;
    const ally = view?.allies[0];
    expect(ally?.abilities.map((x) => x.id)).toEqual(['taskStop', 'fakeTask']);
    expect(Object.keys(ally?.abilities[0] ?? {}).sort()).toEqual(
      Object.keys(view?.abilities[0] ?? {}).sort(),
    );
  });
});

describe('leak: a Task Stop lock is public and names nobody', () => {
  it('every view shows the same lock; its event and views carry no imposter identity', () => {
    const f = scripted();
    const res = run(f.state, { type: 'abilityTaskStop', playerId: f.a.id }, f.now);
    const event = res.effects.find(
      (e): e is Extract<Effect, { kind: 'event' }> =>
        e.kind === 'event' && e.event.type === 'sabotage.started',
    );
    expect(event?.to).toBe('all');
    expect(Object.keys(event?.event ?? {}).sort()).toEqual(['type', 'until']);
    const locks = res.state.players.map(
      (p) => projectView(res.state, p.id, f.now).game?.taskLock?.until,
    );
    expect(new Set(locks).size).toBe(1);
    expect(locks[0]).toBe(f.now + res.state.config.taskStopLockS * S);
    for (const crew of crewOf(res.state)) {
      const view = projectView(res.state, crew.id, f.now);
      const json = JSON.stringify(view);
      for (const imp of imposters(res.state)) {
        expect(json).not.toContain(imp.tag ?? '#none#');
      }
      expect(json).not.toMatch(/saboteur|phantom|"taskStop"|"fakeTask"/);
      const without = projectView(f.state, crew.id, f.now);
      const added = keysDeep(view).filter((k) => !keysDeep(without).includes(k));
      expect(added.filter((k) => !k.startsWith('game.taskLock'))).toEqual([]);
    }
  });

  it('is gone from every view once it has expired', () => {
    const f = scripted();
    const res = run(f.state, { type: 'abilityTaskStop', playerId: f.a.id }, f.now);
    const later = f.now + (res.state.config.taskStopLockS + 1) * S;
    const s = advanceTo(res.state, later);
    for (const p of s.players) expect(projectView(s, p.id, later).game?.taskLock).toBeUndefined();
  });
});

/**
 * Leak tests for tasks (TESTING.md §3, Phase 5): a card shows only what its stage
 * has earned, the type, points, puzzle and solution never travel in a view, other
 * players' tasks never appear, and a fake looks exactly like a real task.
 */
import { describe, expect, it } from 'vitest';

import { reduce } from '../engine/reduce';
import type { RoomState } from '../engine/state';
import {
  advanceTo,
  crewOf,
  moveTo,
  otherPointInSection,
  S,
  stayAt,
  taskAt,
} from '../engine/testkit';
import { buildGameFixture, keysDeep } from './leakHarness';
import { projectView } from './projectView';

/** Key names that would give a task away. No view of anyone may contain them. */
const TASK_SECRETS = [
  'type',
  'points',
  'puzzle',
  'solution',
  'progress',
  'open',
  'pointId',
  'holdSince',
  'fake',
  'fakeOwnerId',
  'ownerId',
  'lockedUntilGameMs',
  'rerollReadyAtGameMs',
  'tasks.type',
];

const lastName = (path: string) => path.split('.').pop()?.replace('[]', '') ?? '';

/** The game with a few tasks pushed to later stages, and one of them open. */
function staged() {
  const fx = buildGameFixture({ players: 8, phase: 'playing', salt: 'tasks-leak' });
  const state = structuredClone(fx.state);
  const [a, b, c] = crewOf(state);
  // a: slot 0 at the pin and open, slot 1 revealed; b: slot 0 revealed; c: untouched (all assigned).
  const t0 = taskAt(state, a!.id, 0);
  Object.assign(t0, {
    stage: 'pin',
    atPin: true,
    open: { puzzle: { secret: 1 }, solution: [7, 7, 7], progress: { used: 2 } },
  });
  Object.assign(taskAt(state, a!.id, 1), { stage: 'pin', atPin: false });
  Object.assign(taskAt(state, b!.id, 0), { stage: 'pin', atPin: false });
  return { ...fx, state, a: a!, b: b!, c: c! };
}

describe('leak: task cards', () => {
  const { state, now, a, c } = staged();
  const viewOf = (id: string) => projectView(state, id, now);

  it('an assigned card holds a direction and nothing else', () => {
    const cards = viewOf(c.id).game?.tasks ?? [];
    expect(cards).toHaveLength(state.config.taskSlots);
    for (const card of cards) {
      expect(Object.keys(card).sort()).toEqual([
        'id',
        'kind',
        'regionId',
        'regionName',
        'section',
        'stage',
      ]);
      expect(card.stage).toBe('assigned');
    }
    const json = JSON.stringify(cards);
    for (const t of c.tasks ?? []) {
      expect(json).not.toContain(String(t.lat));
      expect(json).not.toContain(String(t.lng));
    }
  });

  it('a revealed card also holds the pin and whether the player is at it', () => {
    const cards = viewOf(a.id).game?.tasks ?? [];
    const pin = cards.filter((x) => x.stage === 'pin');
    expect(pin).toHaveLength(2);
    for (const card of pin) {
      expect(Object.keys(card).sort()).toEqual([
        'atPin',
        'id',
        'kind',
        'lat',
        'lng',
        'regionId',
        'regionName',
        'section',
        'stage',
      ]);
    }
    expect(pin.find((x) => x.id === taskAt(state, a.id, 0).id)).toMatchObject({ atPin: true });
  });

  it('no view of anyone contains a task secret key, even while a minigame is open', () => {
    for (const p of state.players) {
      const names = new Set(keysDeep(viewOf(p.id)).map(lastName));
      for (const bad of TASK_SECRETS) expect(names.has(bad), `${p.id}: ${bad}`).toBe(false);
      const json = JSON.stringify(viewOf(p.id));
      expect(json).not.toContain('"secret"');
    }
  });

  it('never shows another player’s tasks: no id and no pin coordinate', () => {
    for (const p of crewOf(state)) {
      const json = JSON.stringify(viewOf(p.id));
      for (const other of crewOf(state)) {
        if (other.id === p.id) continue;
        for (const t of other.tasks ?? []) {
          expect(json, `${p.id} sees ${other.id}'s task id`).not.toContain(t.id);
          if (t.stage === 'pin') {
            expect(json).not.toContain(String(t.lat));
            expect(json).not.toContain(String(t.lng));
          }
        }
      }
    }
    // Imposters see none of them either.
    for (const imp of state.players.filter((p) => p.role === 'imposter')) {
      const view = viewOf(imp.id);
      expect(view.game?.tasks).toEqual([]);
      const json = JSON.stringify(view);
      for (const t of crewOf(state).flatMap((p) => p.tasks ?? [])) expect(json).not.toContain(t.id);
    }
  });

  it('a crew view has no task list outside the playing phase', () => {
    for (const phase of ['spawning', 'reveal', 'ended'] as const) {
      const fx = buildGameFixture({ players: 8, phase });
      for (const p of fx.state.players) {
        expect(projectView(fx.state, p.id, fx.now).game?.tasks).toBeUndefined();
      }
    }
  });

  it('infected, exposed and healthy crew all get the same card structure', () => {
    const healthy = buildGameFixture({ players: 8, phase: 'playing', salt: 'tasks-parity' });
    const id = crewOf(healthy.state)[0]!.id;
    const sick = buildGameFixture({
      players: 8,
      phase: 'playing',
      salt: 'tasks-parity',
      infection: { id, status: 'infected' },
    });
    expect(keysDeep(projectView(sick.state, id, sick.now))).toEqual(
      keysDeep(projectView(healthy.state, id, healthy.now)),
    );
  });
});

describe('leak: a fake task is indistinguishable (TASKS §1, §7)', () => {
  it('has the same card keys at the same stage, and the same open ack shape', () => {
    const fx = buildGameFixture({ players: 8, phase: 'playing', salt: 'fake-parity' });
    const crew = crewOf(fx.state)[0]!;
    const task = taskAt(fx.state, crew.id, 0);
    const real = fx.state;
    const fake = structuredClone(fx.state);
    fake.players.find((p) => p.id === crew.id)!.tasks![0]!.fake = true;
    // Assigned stage.
    const key = (s: RoomState) => keysDeep(projectView(s, crew.id, fx.now).game?.tasks?.[0]);
    expect(key(fake)).toEqual(key(real));
    // Pin stage.
    for (const s of [real, fake])
      Object.assign(s.players.find((p) => p.id === crew.id)!.tasks![0]!, {
        stage: 'pin',
      });
    expect(key(fake)).toEqual(key(real));
    // The open ack has the same shape (only the submit result differs).
    const ackKeys = (s: RoomState) => {
      const at = moveTo(s, crew.id, task, fx.now);
      const res = reduce(at, { type: 'taskOpen', playerId: crew.id, taskId: task.id }, fx.now);
      if (!res.ok) throw new Error(res.message);
      const r = res.effects.find((e) => e.kind === 'reply');
      return keysDeep(r && r.kind === 'reply' ? r.reply : undefined);
    };
    expect(ackKeys(fake)).toEqual(ackKeys(real));
    expect(ackKeys(real).length).toBeGreaterThan(2);
    // And so is their id format.
    expect(task.id).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });
});

describe('leak: the reroll cooldown', () => {
  it('is the viewer’s own and appears only while it runs', () => {
    const fx = buildGameFixture({ players: 8, phase: 'playing', salt: 'tasks-reroll' });
    const crew = crewOf(fx.state)[0]!;
    const other = crewOf(fx.state)[1]!;
    expect(projectView(fx.state, crew.id, fx.now).game?.rerollReadyAt).toBeUndefined();
    const res = reduce(
      fx.state,
      { type: 'taskReroll', playerId: crew.id, taskId: taskAt(fx.state, crew.id).id },
      fx.now,
    );
    if (!res.ok) throw new Error(res.message);
    const mine = projectView(res.state, crew.id, fx.now).game?.rerollReadyAt;
    expect(mine).toBe(fx.now + res.state.config.rerollCooldownS * S);
    expect(projectView(res.state, other.id, fx.now).game?.rerollReadyAt).toBeUndefined();
    // Gone once it has passed.
    const later = fx.now + (res.state.config.rerollCooldownS + 1) * S;
    expect(
      projectView(advanceTo(res.state, later), crew.id, later).game?.rerollReadyAt,
    ).toBeUndefined();
  });
});

// Reveal the pin through the real engine too, so the view code is exercised on an engine-made state.
describe('leak: a card revealed by the engine', () => {
  it('shows the pin only to its owner', () => {
    const fx = buildGameFixture({ players: 8, phase: 'playing', salt: 'tasks-engine' });
    const crew = crewOf(fx.state)[0]!;
    const task = taskAt(fx.state, crew.id);
    const held = stayAt(
      fx.state,
      crew.id,
      otherPointInSection(fx.state, task),
      fx.now,
      fx.state.config.sectionEntryHoldS + 1,
    );
    const mine = projectView(held.state, crew.id, held.now).game?.tasks?.find(
      (c) => c.id === task.id,
    );
    expect(mine?.stage).toBe('pin');
    const other = crewOf(fx.state)[1]!;
    expect(JSON.stringify(projectView(held.state, other.id, held.now))).not.toContain(task.id);
  });
});

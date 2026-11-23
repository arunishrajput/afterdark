import {
  DEFAULT_CONFIG,
  distanceM,
  type KeyFeedback,
  type KeyPuzzle,
  type SoloMinigameType,
  type TaskOpenAck,
  type TaskSubmitAck,
} from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { projectView } from '../../views/projectView';
import { reduce } from '../reduce';
import type { RoomState } from '../state';
import {
  crewOf,
  errCode,
  HOME,
  moveTo,
  newLobby,
  otherPointInSection,
  run,
  S,
  stayAt,
  T0,
  taskAt,
  toPlaying,
} from '../testkit';
import type { Effect } from '../types';
import { refillSlots, resetAllOpen } from './tasks';
import { resetOnDisconnect } from './taskPlay';

const replyOf = (effects: Effect[]) => {
  const e = effects.find((x) => x.kind === 'reply');
  return e && e.kind === 'reply' ? e.reply : undefined;
};
const openAck = (effects: Effect[]): TaskOpenAck => {
  const r = replyOf(effects);
  if (r?.type !== 'open') throw new Error('no open reply');
  return r.ack;
};
const keyPuzzle = (effects: Effect[]): KeyPuzzle => {
  const ack = openAck(effects);
  if (ack.type !== 'keyfetch') throw new Error(`got ${ack.type}`);
  return ack.puzzle;
};
const feedbackOf = (effects: Effect[]) => {
  const r = replyOf(effects);
  if (r?.type !== 'action') throw new Error('no action reply');
  return r.ack.feedback as KeyFeedback;
};

/** A crew member at the pin of a Key Fetch task, on a map big enough for a second point. */
function atPoint1(type: SoloMinigameType = 'keyfetch') {
  const { state: s0, now } = toPlaying(
    newLobby({ radiusM: 400, config: { minigamesEnabled: ['keyfetch', 'wires'] } }),
  );
  const state = structuredClone(s0);
  const crew = crewOf(state)[0]!;
  const task = taskAt(state, crew.id);
  task.type = type;
  const held = stayAt(
    state,
    crew.id,
    otherPointInSection(state, task),
    now,
    state.config.sectionEntryHoldS + 1,
  );
  const arrived = stayAt(held.state, crew.id, task, held.now, 1);
  return { ...arrived, id: crew.id, taskId: task.id };
}

function openAtPin(s: RoomState, id: string, taskId: string, now: number) {
  return run(s, { type: 'taskOpen', playerId: id, taskId }, now);
}
const act = (s: RoomState, id: string, taskId: string, step: 'grab' | 'pickup', now: number) =>
  run(s, { type: 'taskAction', playerId: id, taskId, action: { step } }, now);

/** Grab, hold for keyHoldS of game time, pick up. Returns the state at Point 2's card. */
function takeKey() {
  const at = atPoint1();
  const opened = openAtPin(at.state, at.id, at.taskId, at.now);
  expect(keyPuzzle(opened.effects).leg).toBe(1);
  const grab = act(opened.state, at.id, at.taskId, 'grab', at.now);
  const held = stayAt(
    grab.state,
    at.id,
    taskAt(grab.state, at.id),
    at.now,
    grab.state.config.keyHoldS,
  );
  const pick = act(held.state, at.id, at.taskId, 'pickup', held.now);
  return { ...at, now: held.now, pick, opened, point1: { ...taskAt(at.state, at.id) } };
}

describe('Key Fetch: Point 1', () => {
  it('opens as leg 1 with the pickup hold, at the usual points', () => {
    const at = atPoint1();
    const res = openAtPin(at.state, at.id, at.taskId, at.now);
    const ack = openAck(res.effects);
    expect(ack.points).toBe(at.state.config.points.keyfetch);
    expect(keyPuzzle(res.effects)).toEqual({ leg: 1, holdS: at.state.config.keyHoldS, turns: [] });
  });

  it('refuses to pick the key up before the hold is over, and with no grab at all', () => {
    const at = atPoint1();
    const opened = openAtPin(at.state, at.id, at.taskId, at.now);
    const blind = act(opened.state, at.id, at.taskId, 'pickup', at.now);
    expect(feedbackOf(blind.effects).picked).toBe(false);
    const grab = act(opened.state, at.id, at.taskId, 'grab', at.now);
    const early = stayAt(
      grab.state,
      at.id,
      taskAt(grab.state, at.id),
      at.now,
      grab.state.config.keyHoldS - 1,
    );
    const res = act(early.state, at.id, at.taskId, 'pickup', early.now);
    expect(feedbackOf(res.effects).picked).toBe(false);
    expect(taskAt(res.state, at.id).keyHeld).toBeUndefined();
    expect(taskAt(res.state, at.id).stage).toBe('pin');
  });

  it('a pause does not count towards the hold (game time)', () => {
    const at = atPoint1();
    const opened = openAtPin(at.state, at.id, at.taskId, at.now);
    const grab = act(opened.state, at.id, at.taskId, 'grab', at.now);
    const first = stayAt(grab.state, at.id, taskAt(grab.state, at.id), at.now, 1);
    const paused = run(first.state, { type: 'pause', playerId: 'host' }, first.now);
    const later = first.now + 60 * S;
    // Nothing is accepted while paused.
    const refused = reduce(
      paused.state,
      { type: 'taskAction', playerId: at.id, taskId: at.taskId, action: { step: 'pickup' } },
      later,
    );
    expect(errCode(refused)).toBe('PAUSED');
    // A minute of pause adds nothing: one more second of play is still short of the hold.
    const fresh = moveTo(paused.state, at.id, taskAt(paused.state, at.id), later);
    const resumed = run(fresh, { type: 'resume', playerId: 'host' }, later);
    const moved = stayAt(resumed.state, at.id, taskAt(resumed.state, at.id), later, 1);
    const res = act(moved.state, at.id, at.taskId, 'pickup', moved.now);
    expect(feedbackOf(res.effects).picked).toBe(false);
  });
});

describe('Key Fetch: the key changes the card (TASKS §4)', () => {
  it('moves the card to Point 2 in another section, far enough, at Stage 1, and closes the game', () => {
    const k = takeKey();
    expect(feedbackOf(k.pick.effects).picked).toBe(true);
    const task = taskAt(k.pick.state, k.id);
    expect(task.id).toBe(k.taskId);
    expect(task.keyHeld).toBe(true);
    expect(task.stage).toBe('assigned');
    expect(task.atPin).toBe(false);
    expect(task.open).toBeUndefined();
    expect(task.pointId).not.toBe(k.point1.pointId);
    expect(distanceM(task, k.point1)).toBeGreaterThanOrEqual(k.pick.state.config.keyFetchMinLegM);
    expect(`${task.regionId}:${task.section}`).not.toBe(`${k.point1.regionId}:${k.point1.section}`);
    // Point 1 rests, and no other card of this player sits on Point 2.
    expect(k.pick.state.game?.pointUsedAtGameMs[k.point1.pointId as string]).toBeDefined();
    const others = (k.pick.state.players.find((p) => p.id === k.id)?.tasks ?? []).filter(
      (t) => t.id !== k.taskId,
    );
    expect(others.some((t) => t.pointId === task.pointId)).toBe(false);
  });

  it('shows holdsKey on the owner’s card only, with the usual card shape', () => {
    const k = takeKey();
    const view = projectView(k.pick.state, k.id, k.now);
    const card = view.game?.tasks?.find((t) => t.id === k.taskId);
    expect(card).toMatchObject({ stage: 'assigned', holdsKey: true });
    expect(Object.keys(card ?? {}).sort()).toEqual([
      'holdsKey',
      'id',
      'kind',
      'regionId',
      'regionName',
      'section',
      'stage',
    ]);
    for (const p of k.pick.state.players) {
      if (p.id === k.id) continue;
      expect(JSON.stringify(projectView(k.pick.state, p.id, k.now))).not.toContain('holdsKey');
    }
  });

  it('keeps the key through a Task Stop, a meeting and a disconnect (only the open minigame resets)', () => {
    const k = takeKey();
    const s = structuredClone(k.pick.state);
    const p = s.players.find((x) => x.id === k.id)!;
    const effects: Effect[] = [];
    for (const reason of ['sabotage', 'meeting', 'gps', 'range', 'zone'] as const) {
      taskAt(s, k.id).open = { puzzle: {}, solution: [] };
      resetAllOpen(p, reason, effects);
      expect(taskAt(s, k.id).keyHeld).toBe(true);
    }
    taskAt(s, k.id).open = { puzzle: {}, solution: [] };
    resetOnDisconnect(s, k.id, effects);
    expect(taskAt(s, k.id).keyHeld).toBe(true);
    expect(taskAt(s, k.id).open).toBeUndefined();
  });

  it('plays leg 2 at Point 2: reveal, open as leg 2 with turns, submit the turns, +12 to the team', () => {
    const k = takeKey();
    const state = k.pick.state;
    const task = taskAt(state, k.id);
    const held = stayAt(
      state,
      k.id,
      otherPointInSection(state, task),
      k.now,
      state.config.sectionEntryHoldS + 1,
    );
    expect(taskAt(held.state, k.id).stage).toBe('pin');
    const arrived = stayAt(held.state, k.id, task, held.now, 1);
    expect(taskAt(arrived.state, k.id).atPin).toBe(true);
    const opened = openAtPin(arrived.state, k.id, k.taskId, arrived.now);
    const puzzle = keyPuzzle(opened.effects);
    expect(puzzle.leg).toBe(2);
    expect(puzzle.turns).toHaveLength(state.config.keyTurnSteps);
    // A pickup on leg 2 does nothing.
    expect(
      feedbackOf(act(opened.state, k.id, k.taskId, 'pickup', arrived.now).effects).picked,
    ).toBe(false);
    // Wrong turns are wrong, and lock submitting for a moment.
    const wrong = puzzle.turns.map((t) => (t === 'L' ? 'R' : 'L'));
    const bad = run(
      opened.state,
      { type: 'taskSubmit', playerId: k.id, taskId: k.taskId, answer: wrong },
      arrived.now,
    );
    expect((replyOf(bad.effects) as { ack: TaskSubmitAck }).ack.result).toBe('wrong');
    const later = stayAt(bad.state, k.id, task, arrived.now, state.config.taskWrongLockoutS + 1);
    const done = run(
      later.state,
      { type: 'taskSubmit', playerId: k.id, taskId: k.taskId, answer: puzzle.turns },
      later.now,
    );
    expect((replyOf(done.effects) as { ack: TaskSubmitAck }).ack).toEqual({
      result: 'success',
      points: state.config.points.keyfetch,
    });
    expect(done.state.game?.teamScore).toBe(state.config.points.keyfetch);
    expect(done.state.players.find((p) => p.id === k.id)?.personalScore).toBe(
      state.config.points.keyfetch,
    );
    expect(done.state.players.find((p) => p.id === k.id)?.tasks).toHaveLength(
      state.config.taskSlots,
    );
  });

  it('a leg 1 submit never completes the task (turns need the key)', () => {
    const at = atPoint1();
    const opened = openAtPin(at.state, at.id, at.taskId, at.now);
    const res = run(
      opened.state,
      { type: 'taskSubmit', playerId: at.id, taskId: at.taskId, answer: [] },
      at.now,
    );
    expect((replyOf(res.effects) as { ack: TaskSubmitAck }).ack.result).toBe('wrong');
    expect(res.state.game?.teamScore).toBe(0);
  });
});

describe('Key Fetch: never a fake', () => {
  it('a queued fake never rolls keyfetch, however the weights fall', () => {
    const { state: base } = toPlaying(
      newLobby({
        config: {
          minigamesEnabled: ['keyfetch', 'wires'],
          minigameWeights: { ...DEFAULT_CONFIG.minigameWeights, keyfetch: 1000, wires: 1 },
        },
      }),
    );
    const state = structuredClone(base);
    const crew = crewOf(state)[0]!;
    const game = state.game!;
    crew.tasks = [];
    for (let i = 0; i < 3; i++) {
      game.fakeQueue.push({
        id: `fake${i}`.padEnd(16, 'x'),
        ownerId: 'host',
        lat: HOME.lat,
        lng: HOME.lng,
        regionId: taskAt(base, crew.id).regionId,
        section: taskAt(base, crew.id).section,
      });
    }
    refillSlots(state, crew, T0);
    expect(crew.tasks).toHaveLength(3);
    for (const t of crew.tasks ?? []) {
      expect(t.fake).toBe(true);
      expect(t.type).toBe('wires');
    }
  });
});

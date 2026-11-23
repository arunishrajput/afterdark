import { type LockCode, scoreGuess, type TaskOpenAck, type TaskSubmitAck } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { reduce } from '../reduce';
import type { RoomState } from '../state';
import {
  advanceTo,
  crewOf,
  errCode,
  moveTo,
  newLobby,
  otherPointInSection,
  run,
  S,
  stayAt,
  taskAt,
  toPlaying,
} from '../testkit';
import type { Command, Effect } from '../types';

function playing(opts: Parameters<typeof newLobby>[0] = {}) {
  return toPlaying(newLobby(opts));
}

/** The reply a command left for its caller. */
function replyOf(effects: Effect[]) {
  const e = effects.find((x) => x.kind === 'reply');
  return e && e.kind === 'reply' ? e.reply : undefined;
}

function openAckOf(effects: Effect[]): TaskOpenAck {
  const r = replyOf(effects);
  if (r?.type !== 'open') throw new Error('no open reply');
  return r.ack;
}

function submitAckOf(effects: Effect[]): TaskSubmitAck {
  const r = replyOf(effects);
  if (r?.type !== 'submit') throw new Error('no submit reply');
  return r.ack;
}

/** A crew member standing at the pin of their first task, with the pin revealed. */
function atPin(state0 = playing(), index = 0) {
  const { state, now } = state0;
  const crew = crewOf(state)[0]!;
  const task = taskAt(state, crew.id, index);
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

function cmd(state: RoomState, c: Command, now: number) {
  return run(state, c, now);
}

describe('open (RULES §6.2, E5)', () => {
  it('is refused until the pin is revealed', () => {
    const { state, now } = playing();
    const crew = crewOf(state)[0]!;
    const task = taskAt(state, crew.id);
    const s = moveTo(state, crew.id, task, now); // at the pin spot but the 3 s hold has not run
    expect(errCode(reduce(s, { type: 'taskOpen', playerId: crew.id, taskId: task.id }, now))).toBe(
      'NOT_ALLOWED',
    );
  });

  it('marks atPin and sends task.atPin once within reach', () => {
    const { state, id } = atPin();
    expect(taskAt(state, id).atPin).toBe(true);
  });

  it('replies with the type, the points and the puzzle, and never the solution', () => {
    const { state, now, id, taskId } = atPin();
    const res = cmd(state, { type: 'taskOpen', playerId: id, taskId }, now);
    const ack = openAckOf(res.effects);
    expect(ack.points).toBe(state.config.points[ack.type]);
    expect(ack.type).toBe(taskAt(state, id).type);
    const wire = JSON.stringify(ack);
    const solution = JSON.stringify(taskAt(res.state, id).open?.solution);
    expect(taskAt(res.state, id).open?.solution).toBeDefined();
    expect(wire).not.toContain('solution');
    if (ack.type === 'lock') expect(wire).not.toContain(`"${solution}"`);
  });

  it('is idempotent: opening an open task returns the same puzzle', () => {
    const { state, now, id, taskId } = atPin();
    const a = cmd(state, { type: 'taskOpen', playerId: id, taskId }, now);
    const b = cmd(a.state, { type: 'taskOpen', playerId: id, taskId }, now);
    expect(openAckOf(b.effects)).toEqual(openAckOf(a.effects));
  });

  it('is refused out of reach (OUT_OF_RANGE) and on a weak fix (WEAK_GPS)', () => {
    const { state, now, id, taskId } = atPin();
    const far = taskAt(state, id);
    const away = moveTo(state, id, { lat: far.lat + 0.0003, lng: far.lng }, now); // ~33 m
    expect(errCode(reduce(away, { type: 'taskOpen', playerId: id, taskId }, now))).toBe(
      'OUT_OF_RANGE',
    );
    const weak = run(
      state,
      {
        type: 'locUpdate',
        playerId: id,
        fix: { lat: far.lat, lng: far.lng, accuracy: 50, ts: now },
      },
      now,
    ).state;
    expect(errCode(reduce(weak, { type: 'taskOpen', playerId: id, taskId }, now))).toBe('WEAK_GPS');
  });

  it('is refused for a zone-locked player (TASKS_LOCKED)', () => {
    const { state, now, id, taskId } = atPin();
    const locked = structuredClone(state);
    locked.players.find((p) => p.id === id)!.zone = { outSince: 0, penalties: 0 };
    expect(errCode(reduce(locked, { type: 'taskOpen', playerId: id, taskId }, now))).toBe(
      'TASKS_LOCKED',
    );
  });

  it('only one minigame can be open at a time', () => {
    const { state, now, id, taskId } = atPin();
    const opened = cmd(state, { type: 'taskOpen', playerId: id, taskId }, now).state;
    const other = taskAt(opened, id, 1);
    // Make the second task look revealed and at the pin, as if it shared the spot.
    const s = structuredClone(opened);
    const t = taskAt(s, id, 1);
    t.stage = 'pin';
    t.lat = taskAt(s, id, 0).lat;
    t.lng = taskAt(s, id, 0).lng;
    expect(errCode(reduce(s, { type: 'taskOpen', playerId: id, taskId: other.id }, now))).toBe(
      'NOT_ALLOWED',
    );
  });

  it('is for crew only, and unknown ids are NOT_FOUND', () => {
    const { state, now } = playing();
    const imposter = state.players.find((p) => p.role === 'imposter')!;
    expect(
      errCode(
        reduce(state, { type: 'taskOpen', playerId: imposter.id, taskId: 'x'.repeat(16) }, now),
      ),
    ).toBe('NOT_ALLOWED');
    const crew = crewOf(state)[0]!;
    expect(
      errCode(
        reduce(state, { type: 'taskOpen', playerId: crew.id, taskId: 'nope'.repeat(4) }, now),
      ),
    ).toBe('NOT_FOUND');
  });

  it('is refused outside the playing phase', () => {
    const lobby = newLobby();
    expect(
      errCode(reduce(lobby, { type: 'taskOpen', playerId: 'host', taskId: 'x'.repeat(16) }, 0)),
    ).toBe('WRONG_PHASE');
  });
});

/** Open the player's task and return the open state, for the submit tests. */
function openIt() {
  const at = atPin();
  const opened = cmd(at.state, { type: 'taskOpen', playerId: at.id, taskId: at.taskId }, at.now);
  return { ...at, state: opened.state };
}

/** A crew member at the pin with a task of the given type open (the seed decides types, so look through a few). */
function openTyped(type: 'wires' | 'lock') {
  for (let salt = 0; salt < 60; salt++) {
    const play = toPlaying(newLobby({ radarSalt: `typed-${salt}` }));
    const crew = crewOf(play.state)[0]!;
    const index = crew.tasks!.findIndex((t) => t.type === type);
    if (index < 0) continue;
    const at = atPin(play, index);
    const opened = cmd(at.state, { type: 'taskOpen', playerId: at.id, taskId: at.taskId }, at.now);
    return { ...at, state: opened.state };
  }
  throw new Error(`no ${type} task in 60 seeds`);
}

/** The player's task that is open right now. */
function openTask(state: RoomState, id: string) {
  const t = state.players.find((p) => p.id === id)?.tasks?.find((x) => x.open);
  if (!t) throw new Error('no open task');
  return t;
}

/** The right answer for the open task, read from the server's own state: a test-only solver. */
function rightAnswer(state: RoomState, id: string): unknown {
  return openTask(state, id).open?.solution;
}

describe('submit (RULES §6.3)', () => {
  it('needs an open task', () => {
    const at = atPin();
    expect(
      errCode(
        reduce(
          at.state,
          { type: 'taskSubmit', playerId: at.id, taskId: at.taskId, answer: [0] },
          at.now,
        ),
      ),
    ).toBe('NOT_ALLOWED');
  });

  it('rejects a malformed answer without consuming anything', () => {
    const { state, now, id, taskId } = openIt();
    expect(
      errCode(reduce(state, { type: 'taskSubmit', playerId: id, taskId, answer: 'success' }, now)),
    ).toBe('INVALID_PAYLOAD');
    expect(
      errCode(
        reduce(
          state,
          { type: 'taskSubmit', playerId: id, taskId, answer: { result: 'success' } },
          now,
        ),
      ),
    ).toBe('INVALID_PAYLOAD');
    expect(taskAt(state, id).open?.lockedUntilGameMs).toBeUndefined();
  });

  it('a wrong answer says wrong, scores nothing and locks submitting for taskWrongLockoutS', () => {
    const { state, now, id, taskId } = openTyped('wires');
    const wrong = reduce(
      state,
      { type: 'taskSubmit', playerId: id, taskId, answer: [3, 3, 3, 3] },
      now,
    );
    if (!wrong.ok) throw new Error(wrong.message);
    expect(submitAckOf(wrong.effects)).toEqual({ result: 'wrong', points: 0 });
    expect(wrong.state.game?.teamScore).toBe(0);
    const again = reduce(
      wrong.state,
      { type: 'taskSubmit', playerId: id, taskId, answer: rightAnswer(wrong.state, id) },
      now + S,
    );
    expect(errCode(again)).toBe('COOLDOWN');
    // After the lockout the right answer works.
    const later = now + (state.config.taskWrongLockoutS + 1) * S;
    const s = advanceTo(wrong.state, later);
    const ok = reduce(
      s,
      { type: 'taskSubmit', playerId: id, taskId, answer: rightAnswer(s, id) },
      later,
    );
    if (!ok.ok) throw new Error(ok.message);
    expect(submitAckOf(ok.effects).result).toBe('success');
  });

  it('a forged client cannot succeed: no answer shape other than the solution passes, for any game', () => {
    const { state, now, id, taskId } = openIt();
    const task = taskAt(state, id);
    const tries: unknown[] = [
      [],
      [0],
      [0, 1, 2, 3],
      [1, 0, 3, 2],
      [9, 9, 9],
      'ok',
      true,
      { ok: true },
    ];
    for (const answer of tries) {
      const res = reduce(state, { type: 'taskSubmit', playerId: id, taskId, answer }, now);
      if (!res.ok) continue; // invalid payloads are rejected outright
      const ack = submitAckOf(res.effects);
      const isSolution = JSON.stringify(answer) === JSON.stringify(task.open?.solution);
      // A lock additionally needs a matching guess first, so even its code fails here.
      if (task.type === 'lock') expect(ack.result).toBe('wrong');
      else expect(ack.result).toBe(isSolution ? 'success' : 'wrong');
      expect(res.state.game?.teamScore).toBe(
        isSolution && task.type !== 'lock' ? state.config.points[task.type] : 0,
      );
    }
  });

  it('a right answer scores for the team and the player, removes the task and refills the slot (E10 included)', () => {
    for (const infected of [false, true]) {
      const at = openIt();
      const prepared = structuredClone(at.state);
      if (infected) prepared.players.find((p) => p.id === at.id)!.infection = 'infected';
      const task = taskAt(prepared, at.id);
      let s = prepared;
      if (task.type === 'lock') {
        const g = run(
          s,
          {
            type: 'taskAction',
            playerId: at.id,
            taskId: at.taskId,
            action: { guess: rightAnswer(s, at.id) },
          },
          at.now,
        );
        s = g.state;
      }
      const res = reduce(
        s,
        { type: 'taskSubmit', playerId: at.id, taskId: at.taskId, answer: rightAnswer(s, at.id) },
        at.now,
      );
      if (!res.ok) throw new Error(res.message);
      const points = prepared.config.points[task.type];
      expect(submitAckOf(res.effects)).toEqual({ result: 'success', points });
      expect(res.state.game?.teamScore).toBe(points);
      expect(res.state.players.find((p) => p.id === at.id)?.personalScore).toBe(points);
      const tasks = res.state.players.find((p) => p.id === at.id)!.tasks!;
      expect(tasks).toHaveLength(prepared.config.taskSlots);
      expect(tasks.some((t) => t.id === at.taskId)).toBe(false);
      expect(res.state.game?.pointUsedAtGameMs[task.pointId!]).toBeDefined();
      const toPlayer = res.effects.filter(
        (e) => e.kind === 'event' && e.to !== 'all' && e.to.includes(at.id),
      );
      expect(JSON.stringify(toPlayer)).toContain('task.completed');
    }
  });
});

describe('lock actions (TASKS §4)', () => {
  const lockAtPin = () => openTyped('lock');

  it('answers a guess with exact and misplaced counts, then the exact code solves it', () => {
    const at = lockAtPin();
    const code = openTask(at.state, at.id).open!.solution as LockCode;
    const wrong = code.map((d) => (d + 1) % 6);
    const g = cmd(
      at.state,
      { type: 'taskAction', playerId: at.id, taskId: at.taskId, action: { guess: wrong } },
      at.now,
    );
    const r = replyOf(g.effects);
    expect(r?.type).toBe('action');
    if (r?.type === 'action') {
      expect(r.ack.feedback).toMatchObject({
        ...scoreGuess(code, wrong),
        guessesLeft: 7,
        solved: false,
      });
    }
    const right = cmd(
      g.state,
      { type: 'taskAction', playerId: at.id, taskId: at.taskId, action: { guess: code } },
      at.now,
    );
    const done = reduce(
      right.state,
      { type: 'taskSubmit', playerId: at.id, taskId: at.taskId, answer: code },
      at.now,
    );
    if (!done.ok) throw new Error(done.message);
    expect(submitAckOf(done.effects).result).toBe('success');
  });

  it('refuses the code as a blind submit, and refuses a malformed action', () => {
    const at = lockAtPin();
    const code = openTask(at.state, at.id).open!.solution as LockCode;
    const blind = reduce(
      at.state,
      { type: 'taskSubmit', playerId: at.id, taskId: at.taskId, answer: code },
      at.now,
    );
    if (!blind.ok) throw new Error(blind.message);
    expect(submitAckOf(blind.effects).result).toBe('wrong');
    expect(
      errCode(
        reduce(
          at.state,
          { type: 'taskAction', playerId: at.id, taskId: at.taskId, action: { guess: 'abc' } },
          at.now,
        ),
      ),
    ).toBe('INVALID_PAYLOAD');
  });

  it('a game without actions rejects task:action', () => {
    const at = openIt();
    if (taskAt(at.state, at.id).type === 'lock') return;
    expect(
      errCode(
        reduce(
          at.state,
          { type: 'taskAction', playerId: at.id, taskId: at.taskId, action: { guess: [1, 2, 3] } },
          at.now,
        ),
      ),
    ).toBe('INVALID_PAYLOAD');
  });
});

describe('interruptions (TASKS §6)', () => {
  it('walking beyond reach + taskAbandonExtraM resets the minigame, but not before', () => {
    const at = openIt();
    const task = taskAt(at.state, at.id);
    const m = (n: number) => ({ lat: task.lat + n / 111_320, lng: task.lng });
    // 20 m: past the pin radius (15) but inside the abandon radius (25): still open.
    const near = stayAt(at.state, at.id, m(20), at.now, 1);
    expect(taskAt(near.state, at.id).open).toBeDefined();
    expect(taskAt(near.state, at.id).atPin).toBe(false);
    // 30 m: abandoned. The reveal is kept.
    const far = stayAt(near.state, at.id, m(30), near.now, 1);
    expect(taskAt(far.state, at.id).open).toBeUndefined();
    expect(taskAt(far.state, at.id).stage).toBe('pin');
  });

  it('a stale fix resets the minigame', () => {
    const at = openIt();
    const later = at.now + (at.state.config.staleAfterS + 3) * S;
    const s = run(
      at.state,
      {
        type: 'locUpdate',
        playerId: 'host',
        fix: { lat: 28.6139, lng: 77.209, accuracy: 5, ts: later },
      },
      later,
    ).state;
    expect(taskAt(s, at.id).open).toBeUndefined();
  });

  it('a weak fix does not reset it (the player did not move)', () => {
    const at = openIt();
    const task = taskAt(at.state, at.id);
    const s = run(
      at.state,
      {
        type: 'locUpdate',
        playerId: at.id,
        fix: { lat: task.lat, lng: task.lng, accuracy: 60, ts: at.now + S },
      },
      at.now + S,
    ).state;
    expect(taskAt(s, at.id).open).toBeDefined();
  });

  it('going out of the zone resets it and then blocks opening', () => {
    const at = openIt();
    const s = structuredClone(at.state);
    s.players.find((p) => p.id === at.id)!.zone = { outSince: 0, penalties: 0 };
    // The zone system keeps the flag while the player's good fix is out of bounds: model it by moving out.
    const out = moveTo(s, at.id, { lat: 28.62, lng: 77.22 }, at.now + S);
    const next = advanceTo(out, at.now + 2 * S);
    expect(taskAt(next, at.id).open).toBeUndefined();
  });

  it('a disconnect resets it', () => {
    const at = openIt();
    const res = run(at.state, { type: 'disconnect', playerId: at.id }, at.now);
    expect(taskAt(res.state, at.id).open).toBeUndefined();
    expect(JSON.stringify(res.effects)).toContain('task.reset');
  });

  it('cancel closes the minigame and keeps the task at the pin', () => {
    const at = openIt();
    const s = run(
      at.state,
      { type: 'taskCancel', playerId: at.id, taskId: at.taskId },
      at.now,
    ).state;
    expect(taskAt(s, at.id).open).toBeUndefined();
    expect(taskAt(s, at.id).stage).toBe('pin');
    // Opening again makes a fresh puzzle.
    const again = run(s, { type: 'taskOpen', playerId: at.id, taskId: at.taskId }, at.now);
    expect(openAckOf(again.effects).type).toBe(taskAt(s, at.id).type);
  });

  it('every task command is rejected while the host has paused the game', () => {
    const at = openIt();
    const paused = run(at.state, { type: 'pause', playerId: 'host' }, at.now).state;
    for (const c of [
      { type: 'taskOpen', playerId: at.id, taskId: at.taskId },
      { type: 'taskSubmit', playerId: at.id, taskId: at.taskId, answer: [0] },
      { type: 'taskReroll', playerId: at.id, taskId: at.taskId },
    ] as Command[]) {
      expect(errCode(reduce(paused, c, at.now))).toBe('PAUSED');
    }
  });
});

describe('reroll (RULES §6.5)', () => {
  it('swaps the task, keeps the slots full and starts the cooldown', () => {
    const { state, now } = playing();
    const crew = crewOf(state)[0]!;
    const old = taskAt(state, crew.id);
    const res = run(state, { type: 'taskReroll', playerId: crew.id, taskId: old.id }, now);
    const tasks = res.state.players.find((p) => p.id === crew.id)!.tasks!;
    expect(tasks).toHaveLength(state.config.taskSlots);
    expect(tasks.some((t) => t.id === old.id)).toBe(false);
    expect(tasks.filter((t) => t.pointId === old.pointId)).toHaveLength(0);
    const second = reduce(
      res.state,
      { type: 'taskReroll', playerId: crew.id, taskId: tasks[0]!.id },
      now + S,
    );
    expect(errCode(second)).toBe('COOLDOWN');
    const later = now + state.config.rerollCooldownS * S;
    const ready = advanceTo(res.state, later);
    expect(
      errCode(
        reduce(
          ready,
          { type: 'taskReroll', playerId: crew.id, taskId: taskAt(ready, crew.id).id },
          later,
        ),
      ),
    ).toBe('OK');
  });

  it('the cooldown counts game time, so a pause does not run it down', () => {
    const { state, now } = playing();
    const crew = crewOf(state)[0]!;
    let s = run(
      state,
      { type: 'taskReroll', playerId: crew.id, taskId: taskAt(state, crew.id).id },
      now,
    ).state;
    s = run(s, { type: 'pause', playerId: 'host' }, now + S).state;
    const long = now + (state.config.rerollCooldownS + 60) * S;
    s = advanceTo(s, long);
    s = run(s, { type: 'resume', playerId: 'host' }, long).state;
    expect(
      errCode(
        reduce(
          s,
          { type: 'taskReroll', playerId: crew.id, taskId: taskAt(s, crew.id).id },
          long + S,
        ),
      ),
    ).toBe('COOLDOWN');
  });
});

describe('report unsafe (RULES §6.6, E4)', () => {
  it('disables the point for good, replaces every task on it, logs it and has no cooldown', () => {
    const { state, now } = playing();
    const [a, b] = crewOf(state);
    const reported = taskAt(state, a!.id);
    // Put a second player on the same point.
    const shared = structuredClone(state);
    const theirs = taskAt(shared, b!.id);
    Object.assign(theirs, {
      pointId: reported.pointId,
      lat: reported.lat,
      lng: reported.lng,
      regionId: reported.regionId,
      section: reported.section,
    });
    const res = run(
      shared,
      { type: 'taskReportUnsafe', playerId: a!.id, taskId: reported.id },
      now,
    );
    expect(res.state.setup.taskPoints.find((p) => p.id === reported.pointId)?.disabled).toBe(true);
    for (const id of [a!.id, b!.id]) {
      const tasks = res.state.players.find((p) => p.id === id)!.tasks!;
      expect(tasks).toHaveLength(state.config.taskSlots);
      expect(tasks.some((t) => t.pointId === reported.pointId)).toBe(false);
    }
    expect(res.effects).toContainEqual({
      kind: 'audit',
      what: 'unsafePoint',
      pointId: reported.pointId,
    });
    const toOther = res.effects.filter(
      (e) => e.kind === 'event' && e.to !== 'all' && e.to.includes(b!.id),
    );
    expect(JSON.stringify(toOther)).toContain('task.removed');
    // No cooldown: the next report works at once.
    const next = taskAt(res.state, a!.id);
    expect(
      errCode(
        reduce(res.state, { type: 'taskReportUnsafe', playerId: a!.id, taskId: next.id }, now),
      ),
    ).toBe('OK');
  });

  it('the point is never handed out again', () => {
    const first = playing({ config: { playTimeMin: 600 } });
    let { state } = first;
    const { now } = first;
    const crew = crewOf(state)[0]!;
    const bad = taskAt(state, crew.id).pointId;
    state = run(
      state,
      { type: 'taskReportUnsafe', playerId: crew.id, taskId: taskAt(state, crew.id).id },
      now,
    ).state;
    for (let i = 0; i < 25; i++) {
      state = run(
        state,
        { type: 'taskReroll', playerId: crew.id, taskId: taskAt(state, crew.id).id },
        now + (i + 1) * 200 * S,
      ).state;
      for (const p of crewOf(state)) expect(p.tasks?.some((t) => t.pointId === bad)).toBe(false);
    }
  });
});

describe('V1 crew win (RULES §12)', () => {
  it('ends the game when the team score reaches the target', () => {
    const at = openTyped('wires');
    const s = structuredClone(at.state);
    s.config.targetScore = 4;
    const res = reduce(
      s,
      { type: 'taskSubmit', playerId: at.id, taskId: at.taskId, answer: rightAnswer(s, at.id) },
      at.now,
    );
    if (!res.ok) throw new Error(res.message);
    expect(res.state.phase).toBe('ended');
    expect(res.state.result).toEqual({ winner: 'crew', reason: 'score' });
  });

  it('dev:autoComplete finishes an open task in test mode only', () => {
    const at = openIt();
    const res = run(
      at.state,
      { type: 'devAutoComplete', playerId: at.id, taskId: at.taskId },
      at.now,
    );
    expect(res.state.game?.teamScore).toBe(at.state.config.points[taskAt(at.state, at.id).type]);
    const off = structuredClone(at.state);
    off.config.testMode = false;
    expect(
      errCode(reduce(off, { type: 'devAutoComplete', playerId: at.id, taskId: at.taskId }, at.now)),
    ).toBe('NOT_ALLOWED');
    // It needs an open task.
    const idle = playing();
    const crew = crewOf(idle.state)[0]!;
    expect(
      errCode(
        reduce(
          idle.state,
          { type: 'devAutoComplete', playerId: crew.id, taskId: taskAt(idle.state, crew.id).id },
          idle.now,
        ),
      ),
    ).toBe('NOT_ALLOWED');
  });

  it('fake tasks pay nothing and fool the player', () => {
    const at = openTyped('wires');
    const s = structuredClone(at.state);
    s.players.find((p) => p.id === at.id)!.tasks!.find((t) => t.id === at.taskId)!.fake = true;
    const res = reduce(
      s,
      { type: 'taskSubmit', playerId: at.id, taskId: at.taskId, answer: rightAnswer(s, at.id) },
      at.now,
    );
    if (!res.ok) throw new Error(res.message);
    expect(submitAckOf(res.effects)).toEqual({ result: 'fooled', points: 0 });
    expect(res.state.game?.teamScore).toBe(0);
    expect(res.state.players.find((p) => p.id === at.id)?.personalScore).toBe(0);
    expect(res.state.players.find((p) => p.id === at.id)?.tasks).toHaveLength(s.config.taskSlots);
  });
});

describe('dev:setMinigames (test mode)', () => {
  it('limits the types new tasks roll, in the lobby, for the host, in test mode only', () => {
    const lobby = newLobby();
    const res = run(lobby, { type: 'devSetMinigames', playerId: 'host', types: ['lock'] });
    expect(res.state.config.minigamesEnabled).toEqual(['lock']);
    // Every task of the game that follows is a lock.
    const play = toPlaying(res.state);
    for (const p of crewOf(play.state)) for (const t of p.tasks ?? []) expect(t.type).toBe('lock');
    expect(
      errCode(reduce(lobby, { type: 'devSetMinigames', playerId: 'p1', types: ['lock'] }, 0)),
    ).toBe('NOT_HOST');
    expect(
      errCode(
        reduce(play.state, { type: 'devSetMinigames', playerId: 'host', types: ['lock'] }, 0),
      ),
    ).toBe('WRONG_PHASE');
    // A type with no game yet is dropped; with nothing left it is refused.
    expect(
      errCode(reduce(lobby, { type: 'devSetMinigames', playerId: 'host', types: ['pattern'] }, 0)),
    ).toBe('INVALID_PAYLOAD');
    const off = structuredClone(lobby);
    off.config.testMode = false;
    expect(
      errCode(reduce(off, { type: 'devSetMinigames', playerId: 'host', types: ['lock'] }, 0)),
    ).toBe('NOT_ALLOWED');
  });
});

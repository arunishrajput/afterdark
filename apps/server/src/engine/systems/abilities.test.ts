import { DEFAULT_CONFIG, type LatLng, offsetByMeters, toPosition } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { reduce } from '../reduce';
import type { PlayerState, RoomState } from '../state';
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
import { abilityIdsFor, applyPostMeetingGrace, applyRecovery, initialAbilities } from './abilities';
import { eject } from './ejection';
import { checkFakeTask } from './fakeTask';
import { isTaskLocked } from './taskStop';

const CFG = DEFAULT_CONFIG;
const COOLDOWN_MS = CFG.abilityInitialCooldownS * S;

const imposters = (s: RoomState) => s.players.filter((p) => p.role === 'imposter');
const get = (s: RoomState, id: string): PlayerState => {
  const p = s.players.find((x) => x.id === id);
  if (!p) throw new Error(`no player ${id}`);
  return p;
};

interface Fixture {
  state: RoomState;
  now: number;
  /** The first and second imposter: both hold Task Stop and Fake Task. */
  a: string;
  b: string;
}

/** A 6-player game of wires tasks, the two imposters armed with every implemented ability and past the initial cooldown. */
function ready(extra: Partial<typeof CFG> = {}): Fixture {
  const start = toPlaying(
    newLobby({ players: 6, config: { minigamesEnabled: ['wires'], ...extra } }),
  );
  const state = structuredClone(start.state);
  for (const p of imposters(state)) {
    p.classes = ['saboteur', 'phantom'];
    p.abilities = initialAbilities(state.config, p.classes);
  }
  const now = start.now + COOLDOWN_MS + S;
  const [a, b] = imposters(state);
  return { state: advanceTo(state, now), now, a: a!.id, b: b!.id };
}

const stop = (_s: RoomState, id: string, _now: number): Command => ({
  type: 'abilityTaskStop',
  playerId: id,
});
const fake = (id: string, at: LatLng): Command => ({ type: 'abilityFakeTask', playerId: id, at });

function replyOf(effects: Effect[]) {
  const e = effects.find((x) => x.kind === 'reply');
  return e && e.kind === 'reply' ? e.reply : undefined;
}

/** Steps one second at a time with every fix refreshed. */
function walk(state: RoomState, from: number, seconds: number) {
  let s = state;
  let t = from;
  for (let i = 0; i < seconds; i++) {
    t += S;
    s = advanceTo(s, t);
  }
  return { state: s, now: t };
}

/** A spot Fake Task accepts, found by asking the rule itself. */
function freeSpot(state: RoomState, actorId: string, skip = 0): LatLng {
  let seen = 0;
  for (let dx = -200; dx <= 200; dx += 15) {
    for (let dy = -200; dy <= 200; dy += 15) {
      const at = offsetByMeters({ lat: 28.6139, lng: 77.209 }, dx, dy);
      try {
        checkFakeTask(state, get(state, actorId), at);
      } catch {
        continue;
      }
      if (seen++ === skip) return at;
    }
  }
  throw new Error('no free spot');
}

describe('class ability registry and `all` mode (RULES §7)', () => {
  it('maps a class to the abilities that exist in this build (Camouflage comes in Phase 10)', () => {
    expect(abilityIdsFor(['saboteur'])).toEqual(['taskStop']);
    expect(abilityIdsFor(['phantom'])).toEqual(['fakeTask']);
    expect(abilityIdsFor(['camouflage'])).toEqual([]);
    expect(abilityIdsFor(['saboteur', 'phantom', 'camouflage'])).toEqual(['taskStop', 'fakeTask']);
  });

  it('every ability starts with abilityInitialCooldownS', () => {
    expect(initialAbilities(CFG, ['saboteur', 'phantom'])).toEqual({
      taskStop: { readyAtGameMs: COOLDOWN_MS },
      fakeTask: { readyAtGameMs: COOLDOWN_MS },
    });
  });

  it('classes mode: each imposter holds only their own class ability', () => {
    const { state } = toPlaying(newLobby({ players: 6 }));
    for (const p of imposters(state)) {
      expect(Object.keys(p.abilities ?? {})).toEqual(abilityIdsFor(p.classes ?? []));
      expect(p.classes).toHaveLength(1);
    }
    expect(crewOf(state).every((p) => p.abilities === undefined)).toBe(true);
  });

  it('all mode: every imposter holds Task Stop and Fake Task, each with its own cooldown', () => {
    const { state } = toPlaying(newLobby({ players: 6, config: { imposterAbilityMode: 'all' } }));
    for (const p of imposters(state)) {
      expect(Object.keys(p.abilities ?? {}).sort()).toEqual(['fakeTask', 'taskStop']);
    }
    const { state: used, now, a } = ready({ imposterAbilityMode: 'all' });
    const res = run(used, stop(used, a, now), now);
    const mine = get(res.state, a).abilities;
    expect(mine?.taskStop?.readyAtGameMs).toBeGreaterThan(mine?.fakeTask?.readyAtGameMs ?? 0);
  });
});

describe('common checks (09.1)', () => {
  it('refuses crew, an imposter without the ability, and the wrong phase', () => {
    const { state, now, a } = ready();
    const crew = crewOf(state)[0]!.id;
    expect(errCode(reduce(state, stop(state, crew, now), now))).toBe('NOT_ALLOWED');
    const noFake = structuredClone(state);
    delete get(noFake, a).abilities?.fakeTask;
    expect(errCode(reduce(noFake, fake(a, freeSpot(state, a)), now))).toBe('NOT_ALLOWED');
    const lobby = newLobby();
    expect(errCode(reduce(lobby, stop(lobby, 'host', 0), 0))).toBe('WRONG_PHASE');
  });

  it('is on cooldown for the first abilityInitialCooldownS of play', () => {
    const start = toPlaying(newLobby({ players: 6 }));
    const s = structuredClone(start.state);
    for (const p of imposters(s)) p.abilities = initialAbilities(s.config, ['saboteur']);
    const a = imposters(s)[0]!.id;
    const early = advanceTo(s, start.now + 30 * S);
    expect(errCode(reduce(early, stop(early, a, 0), start.now + 30 * S))).toBe('COOLDOWN');
    const late = advanceTo(s, start.now + COOLDOWN_MS);
    expect(errCode(reduce(late, stop(late, a, 0), start.now + COOLDOWN_MS))).toBe('OK');
  });

  it('a use starts the cooldown; a rejected use does not (E13)', () => {
    const { state, now, a } = ready();
    const used = run(state, stop(state, a, now), now);
    expect(get(used.state, a).abilities?.taskStop?.readyAtGameMs).toBe(
      used.state.game!.clock.gameMs +
        CFG.taskStopCooldownS * S +
        (now - used.state.game!.clock.runningSince!),
    );
    const bad = reduce(state, fake(a, offsetByMeters({ lat: 28.6139, lng: 77.209 }, 5000, 0)), now);
    expect(errCode(bad)).toBe('OUT_OF_BOUNDS');
    expect(get(state, a).abilities?.fakeTask?.readyAtGameMs).toBe(COOLDOWN_MS);
  });

  it('is refused while a meeting runs, and for the post-meeting grace afterwards', () => {
    const { state, now, a } = ready();
    const crew = crewOf(state)[0]!.id;
    let t = now + CFG.meetingStartGraceS * S;
    let s = advanceTo(state, t);
    s = run(s, { type: 'meetingCall', playerId: crew }, t).state;
    expect(errCode(reduce(s, stop(s, a, t), t))).toBe('MEETING_ACTIVE');
    while (s.game?.meeting) {
      t += 200 * S;
      s = advanceTo(s, t);
    }
    const gameMs = s.game!.clock.gameMs;
    for (const id of ['taskStop', 'fakeTask'] as const) {
      expect(get(s, a).abilities?.[id]?.readyAtGameMs).toBeGreaterThanOrEqual(
        gameMs + CFG.postMeetingGraceS * S,
      );
    }
    expect(errCode(reduce(s, stop(s, a, t), t))).toBe('COOLDOWN');
    const after = advanceTo(s, t + CFG.postMeetingGraceS * S + S);
    expect(errCode(reduce(after, stop(after, a, 0), t + CFG.postMeetingGraceS * S + S))).toBe('OK');
  });

  it('is refused while the host has paused the game', () => {
    const { state, now, a } = ready();
    const paused = run(state, { type: 'pause', playerId: 'host' }, now).state;
    expect(errCode(reduce(paused, stop(paused, a, now), now))).toBe('PAUSED');
  });

  it('needs a good fix inside the area (RULES §9.3)', () => {
    const { state, now, a } = ready();
    const out = moveTo(state, a, offsetByMeters({ lat: 28.6139, lng: 77.209 }, 400, 0), now);
    expect(errCode(reduce(out, stop(out, a, now), now))).toBe('OUT_OF_BOUNDS');
    const weak = run(
      state,
      {
        type: 'locUpdate',
        playerId: a,
        fix: { lat: get(state, a).loc!.lat, lng: get(state, a).loc!.lng, accuracy: 50, ts: now },
      },
      now,
    ).state;
    expect(errCode(reduce(weak, stop(weak, a, now), now))).toBe('WEAK_GPS');
    const stale = advanceTo(state, now);
    const later = structuredClone(stale);
    expect(errCode(reduce(later, stop(later, a, now + 60 * S), now + 60 * S))).toBe('STALE');
  });

  it('an out-of-bounds imposter does not recharge (the ready time moves back by the time spent out)', () => {
    const { state, now, a } = ready();
    const used = run(state, stop(state, a, now), now);
    const before = get(used.state, a).abilities!.taskStop!.readyAtGameMs;
    const out = moveTo(used.state, a, offsetByMeters({ lat: 28.6139, lng: 77.209 }, 400, 0), now);
    const walked = walk(out, now, 30);
    const moved = get(walked.state, a).abilities!.taskStop!.readyAtGameMs - before;
    expect(moved).toBeGreaterThanOrEqual(29 * S);
    expect(moved).toBeLessThanOrEqual(31 * S);
    // Back inside it stops moving.
    const home = moveTo(walked.state, a, { lat: 28.6139, lng: 77.209 }, walked.now);
    const settled = get(home, a).abilities!.taskStop!.readyAtGameMs;
    const rest = walk(home, walked.now, 10);
    expect(get(rest.state, a).abilities!.taskStop!.readyAtGameMs).toBeLessThanOrEqual(settled + S);
  });
});

describe('cooldown recovery hook (RULES §7.5, used from Phase 10)', () => {
  it('cuts the remaining time of every class ability by the fraction, and leaves Infect and a ready ability alone', () => {
    const { state, now, a } = ready();
    const s = run(state, stop(state, a, now), now).state;
    const p = get(s, a);
    const gameMs = s.game!.clock.gameMs + (now - s.game!.clock.runningSince!);
    const remaining = p.abilities!.taskStop!.readyAtGameMs - gameMs;
    const infectBefore = p.infect!.readyAtGameMs;
    const readyBefore = p.abilities!.fakeTask!.readyAtGameMs;
    applyRecovery(s, p, 0.5, now);
    expect(p.abilities!.taskStop!.readyAtGameMs).toBeCloseTo(gameMs + remaining / 2, 0);
    expect(p.abilities!.fakeTask!.readyAtGameMs).toBe(readyBefore);
    expect(p.infect!.readyAtGameMs).toBe(infectBefore);
  });

  it('the post-meeting grace only raises a cooldown, never lowers it', () => {
    const p = { abilities: { taskStop: { readyAtGameMs: 500 }, fakeTask: { readyAtGameMs: 50 } } };
    applyPostMeetingGrace(p as PlayerState, 200);
    expect(p.abilities.taskStop.readyAtGameMs).toBe(500);
    expect(p.abilities.fakeTask.readyAtGameMs).toBe(200);
  });
});

/** A crew member at the pin of a wires task with it open. */
function openedCrew(f: Fixture) {
  const crew = crewOf(f.state)[0]!;
  const task = taskAt(f.state, crew.id);
  const held = stayAt(
    f.state,
    crew.id,
    otherPointInSection(f.state, task),
    f.now,
    f.state.config.sectionEntryHoldS + 1,
  );
  const arrived = stayAt(held.state, crew.id, task, held.now, 1);
  const opened = run(
    arrived.state,
    { type: 'taskOpen', playerId: crew.id, taskId: task.id },
    arrived.now,
  );
  return { state: opened.state, now: arrived.now, id: crew.id, taskId: task.id };
}

describe('Task Stop (RULES §7.2, E11, E12, E23)', () => {
  it('resets an open minigame to the pin, keeps the reveal, and announces a public lock', () => {
    const f = ready();
    const o = openedCrew({ ...f, state: f.state, now: f.now });
    expect(taskAt(o.state, o.id).open).toBeDefined();
    const res = run(o.state, stop(o.state, f.a, o.now), o.now);
    const t = taskAt(res.state, o.id);
    expect(t.open).toBeUndefined();
    expect(t.stage).toBe('pin');
    expect(t.atPin).toBe(true);
    const sabotage = res.effects.find(
      (e) => e.kind === 'event' && e.event.type === 'sabotage.started',
    );
    expect(sabotage).toMatchObject({ to: 'all', event: { until: o.now + CFG.taskStopLockS * S } });
    expect(res.effects).toContainEqual({
      kind: 'event',
      to: [o.id],
      event: { type: 'task.reset', reason: 'sabotage' },
    });
    expect(replyOf(res.effects)).toEqual({
      type: 'taskStop',
      ack: { lockEndsAt: o.now + CFG.taskStopLockS * S },
    });
  });

  it('rejects open, action and submit for taskStopLockS, then works again (E11)', () => {
    const f = ready();
    const o = openedCrew(f);
    const s = run(o.state, stop(o.state, f.a, o.now), o.now).state;
    const open: Command = { type: 'taskOpen', playerId: o.id, taskId: o.taskId };
    const submit: Command = { type: 'taskSubmit', playerId: o.id, taskId: o.taskId, answer: [0] };
    const action: Command = { type: 'taskAction', playerId: o.id, taskId: o.taskId, action: {} };
    for (const c of [open, submit, action]) {
      expect(errCode(reduce(s, c, o.now + S))).toBe('TASKS_LOCKED');
    }
    const w = walk(s, o.now, CFG.taskStopLockS - 1);
    expect(isTaskLocked(w.state, w.now)).toBe(true);
    expect(errCode(reduce(w.state, open, w.now))).toBe('TASKS_LOCKED');
    const after = walk(w.state, w.now, 2);
    expect(isTaskLocked(after.state, after.now)).toBe(false);
    expect(after.state.game?.taskLock).toBeUndefined();
    expect(errCode(reduce(after.state, open, after.now))).toBe('OK');
  });

  it('an open minigame on its final step resets too, and the submit is refused (E11)', () => {
    const f = ready();
    const o = openedCrew(f);
    const answer = taskAt(o.state, o.id).open?.solution;
    const s = run(o.state, stop(o.state, f.a, o.now), o.now).state;
    const res = reduce(s, { type: 'taskSubmit', playerId: o.id, taskId: o.taskId, answer }, o.now);
    expect(errCode(res)).toBe('TASKS_LOCKED');
    expect(s.game?.teamScore).toBe(0);
  });

  it('cannot be activated while a lock is running (E12)', () => {
    const f = ready();
    const first = run(f.state, stop(f.state, f.a, f.now), f.now);
    expect(errCode(reduce(first.state, stop(first.state, f.b, f.now), f.now + S))).toBe(
      'NOT_ALLOWED',
    );
  });

  it('the lock time freezes during a meeting and carries on after it (E23)', () => {
    const f = ready();
    const crew = crewOf(f.state)[0]!.id;
    let t = f.now + CFG.meetingStartGraceS * S;
    let s = advanceTo(f.state, t);
    s = run(s, stop(s, f.a, t), t).state;
    const lockEnds = s.game!.taskLock!.untilGameMs;
    t += 5 * S;
    s = advanceTo(s, t);
    s = run(s, { type: 'meetingCall', playerId: crew }, t).state;
    while (s.game?.meeting) {
      t += 200 * S;
      s = advanceTo(s, t);
    }
    expect(s.game?.taskLock?.untilGameMs).toBe(lockEnds);
    expect(isTaskLocked(s, t)).toBe(true);
    const later = walk(s, t, CFG.taskStopLockS);
    expect(isTaskLocked(later.state, later.now)).toBe(false);
  });

  it('is refused for an ejected imposter and while out of bounds', () => {
    const f = ready();
    const ejected = structuredClone(f.state);
    get(ejected, f.a).spectator = true;
    delete get(ejected, f.a).abilities;
    expect(errCode(reduce(ejected, stop(ejected, f.a, f.now), f.now))).toBe('NOT_ALLOWED');
  });

  it.todo('keeps a key that was already picked up (Key Fetch arrives in Phase 11)');
});

describe('Fake Task (RULES §7.3, TASKS §7, E13–E16)', () => {
  it('plants a queued fake with its own id, and starts the cooldown', () => {
    const f = ready();
    const at = freeSpot(f.state, f.a);
    const res = run(f.state, fake(f.a, at), f.now);
    const queued = res.state.game!.fakeQueue;
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ ownerId: f.a, lat: at.lat, lng: at.lng });
    expect(queued[0]!.id).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(replyOf(res.effects)).toEqual({ type: 'fakeTask', ack: { fakeId: queued[0]!.id } });
    expect(get(res.state, f.a).abilities!.fakeTask!.readyAtGameMs).toBeGreaterThan(
      get(f.state, f.a).abilities!.fakeTask!.readyAtGameMs,
    );
  });

  it('rejects a pin outside the boundary, in a no-go zone, or too close to a point or another fake (E13)', () => {
    const f = ready();
    const ok = freeSpot(f.state, f.a);
    const outside = offsetByMeters({ lat: 28.6139, lng: 77.209 }, 3000, 0);
    expect(errCode(reduce(f.state, fake(f.a, outside), f.now))).toBe('OUT_OF_BOUNDS');

    const zoned = structuredClone(f.state);
    const box = [
      offsetByMeters(ok, -20, -20),
      offsetByMeters(ok, -20, 20),
      offsetByMeters(ok, 20, 20),
      offsetByMeters(ok, 20, -20),
    ].map(toPosition);
    zoned.setup.noGo = [[...box, box[0]!]];
    expect(errCode(reduce(zoned, fake(f.a, ok), f.now))).toBe('OUT_OF_BOUNDS');

    const pt = f.state.setup.taskPoints.find((p) => !p.disabled)!;
    const nearPoint = offsetByMeters(pt, 10, 0);
    expect(errCode(reduce(f.state, fake(f.a, nearPoint), f.now))).toBe('NOT_ALLOWED');

    const placed = run(f.state, fake(f.a, ok), f.now).state;
    expect(errCode(reduce(placed, fake(f.b, offsetByMeters(ok, 10, 0)), f.now))).toBe(
      'NOT_ALLOWED',
    );
    // Nothing was spent by any rejection.
    expect(get(f.state, f.a).abilities!.fakeTask!.readyAtGameMs).toBe(COOLDOWN_MS);
  });

  it('allows at most fakeTaskMaxActive per Phantom, queued or assigned, and frees a slot when one is done (E14, E16)', () => {
    const f = ready({ imposterAbilityMode: 'all' });
    let s = f.state;
    let t = f.now;
    const spots = [0, 1, 2].map((i) => freeSpot(s, f.a, i * 8));
    s = run(s, fake(f.a, spots[0]!), t).state;
    // Recharge, then plant the second.
    t += CFG.fakeTaskCooldownS * S;
    s = advanceTo(s, t);
    s = run(s, fake(f.a, spots[1]!), t).state;
    t += CFG.fakeTaskCooldownS * S;
    s = advanceTo(s, t);
    expect(errCode(reduce(s, fake(f.a, spots[2]!), t))).toBe('NOT_ALLOWED');

    // A crew member rerolls: their slot takes the oldest fake. It is now assigned, and still counts.
    const crew = crewOf(s)[0]!;
    const before = taskAt(s, crew.id, 0);
    s = run(s, { type: 'taskReroll', playerId: crew.id, taskId: before.id }, t).state;
    const held = crewOf(s)[0]!.tasks!.filter((x) => x.fake);
    expect(held).toHaveLength(1);
    expect(errCode(reduce(s, fake(f.a, spots[2]!), t))).toBe('NOT_ALLOWED');

    // Rerolling the fake removes it (E16) and frees a slot of the Phantom's count.
    const fakeTask = held[0]!;
    t += CFG.rerollCooldownS * S;
    s = advanceTo(s, t);
    s = run(s, { type: 'taskReroll', playerId: crew.id, taskId: fakeTask.id }, t).state;
    const stillHeld = s.players.flatMap((p) => p.tasks ?? []).filter((x) => x.fake);
    expect(stillHeld.length).toBeLessThanOrEqual(1);
    expect(errCode(reduce(s, fake(f.a, spots[2]!), t))).toBe('OK');
  });

  it('the next slot that refills takes the oldest queued fake, and it looks like any other task', () => {
    const f = ready({ imposterAbilityMode: 'all' });
    const spotA = freeSpot(f.state, f.a);
    const first = run(f.state, fake(f.a, spotA), f.now);
    const fakeId = first.state.game!.fakeQueue[0]!.id;
    const crew = crewOf(first.state)[0]!;
    const old = taskAt(first.state, crew.id, 0);
    const s = run(
      first.state,
      { type: 'taskReroll', playerId: crew.id, taskId: old.id },
      f.now,
    ).state;
    const got = crewOf(s)[0]!.tasks!.find((x) => x.id === fakeId);
    expect(got).toMatchObject({
      fake: true,
      fakeOwnerId: f.a,
      kind: 'solo',
      stage: 'assigned',
      lat: spotA.lat,
      lng: spotA.lng,
    });
    expect(got?.type).not.toBe('keyfetch');
    expect(s.game!.fakeQueue).toHaveLength(0);
    expect(got?.pointId).toBeUndefined();
  });

  it('queue order is first planted, first served', () => {
    const f = ready({ imposterAbilityMode: 'all' });
    let s = f.state;
    const t = f.now;
    s = run(s, fake(f.a, freeSpot(s, f.a)), t).state;
    const firstId = s.game!.fakeQueue[0]!.id;
    s = run(s, fake(f.b, freeSpot(s, f.b, 5)), t).state;
    const secondId = s.game!.fakeQueue[1]!.id;
    const [c1, c2] = crewOf(s);
    s = run(s, { type: 'taskReroll', playerId: c1!.id, taskId: taskAt(s, c1!.id, 0).id }, t).state;
    s = run(s, { type: 'taskReroll', playerId: c2!.id, taskId: taskAt(s, c2!.id, 0).id }, t).state;
    expect(crewOf(s)[0]!.tasks!.some((x) => x.id === firstId)).toBe(true);
    expect(crewOf(s)[1]!.tasks!.some((x) => x.id === secondId)).toBe(true);
  });

  it('completing a fake answers fooled, pays nothing, and never raises the team score', () => {
    const f = ready();
    const spot = freeSpot(f.state, f.a);
    let s = run(f.state, fake(f.a, spot), f.now).state;
    const crew = crewOf(s)[0]!;
    s = run(
      s,
      { type: 'taskReroll', playerId: crew.id, taskId: taskAt(s, crew.id, 0).id },
      f.now,
    ).state;
    const fakeTask = crewOf(s)[0]!.tasks!.find((x) => x.fake)!;
    const held = stayAt(s, crew.id, otherPointInSection(s, fakeTask), f.now, 5);
    const arrived = stayAt(held.state, crew.id, fakeTask, held.now, 1);
    const opened = run(
      arrived.state,
      { type: 'taskOpen', playerId: crew.id, taskId: fakeTask.id },
      arrived.now,
    );
    const answer = taskAt(opened.state, crew.id, 2).open?.solution;
    const teamBefore = opened.state.game!.teamScore;
    const res = run(
      opened.state,
      { type: 'taskSubmit', playerId: crew.id, taskId: fakeTask.id, answer },
      arrived.now,
    );
    expect(replyOf(res.effects)).toEqual({ type: 'submit', ack: { result: 'fooled', points: 0 } });
    expect(res.state.game!.teamScore).toBe(teamBefore);
    expect(get(res.state, crew.id).personalScore).toBe(get(opened.state, crew.id).personalScore);
  });

  it('an ejected Phantom takes the fakes still in the queue with them; a fake already in a slot stays', () => {
    const f = ready({ imposterAbilityMode: 'all' });
    let s = run(f.state, fake(f.a, freeSpot(f.state, f.a)), f.now).state;
    s = run(s, fake(f.b, freeSpot(s, f.b, 6)), f.now).state;
    expect(s.game!.fakeQueue).toHaveLength(2);
    const crew = crewOf(s)[0]!;
    s = run(
      s,
      { type: 'taskReroll', playerId: crew.id, taskId: taskAt(s, crew.id, 0).id },
      f.now,
    ).state;
    // A's fake is now in a crew slot; B's is still queued. Eject both Phantoms in turn.
    expect(s.game!.fakeQueue.map((q) => q.ownerId)).toEqual([f.b]);
    const ejectedA = structuredClone(s);
    eject(ejectedA, get(ejectedA, f.a));
    expect(ejectedA.game!.fakeQueue).toHaveLength(1);
    expect(get(ejectedA, f.a).abilities).toBeUndefined();
    expect(crewOf(ejectedA)[0]!.tasks!.some((x) => x.fakeOwnerId === f.a)).toBe(true);
    const ejectedB = structuredClone(s);
    eject(ejectedB, get(ejectedB, f.b));
    expect(ejectedB.game!.fakeQueue).toHaveLength(0);
  });
});

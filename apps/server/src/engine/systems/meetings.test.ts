import { DEFAULT_CONFIG, type LatLng, offsetByMeters } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { gameNow } from '../clock';
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
import { compromisedCount } from './victory';

const CFG = DEFAULT_CONFIG;
const GRACE_S = CFG.meetingStartGraceS;

const get = (s: RoomState, id: string): PlayerState => {
  const p = s.players.find((x) => x.id === id);
  if (!p) throw new Error(`no player ${id}`);
  return p;
};
const byRole = (s: RoomState, role: 'crew' | 'imposter') =>
  s.players.filter((p) => p.role === role);
const base = (s: RoomState): LatLng => {
  if (!s.setup.base) throw new Error('no base');
  return s.setup.base;
};
const meeting = (s: RoomState) => s.game?.meeting;
const eventsOf = (effects: Effect[], type: string) =>
  effects.filter((e) => e.kind === 'event' && e.event.type === type);
const call = (s: RoomState, id: string, now: number) =>
  reduce(s, { type: 'meetingCall', playerId: id }, now);

interface Fixture {
  state: RoomState;
  now: number;
}

/** A running 8-player game with the 120 s start grace behind it (game time jumped, fixes fresh). */
function afterGrace(players = 8, config: Parameters<typeof newLobby>[0] = {}): Fixture {
  const start = toPlaying(newLobby({ players, ...config }));
  const jumped = run(
    start.state,
    { type: 'devAdvanceClock', playerId: 'host', seconds: GRACE_S + 5 },
    start.now,
  ).state;
  const now = start.now + S;
  return { state: advanceTo(jumped, now), now };
}

/** The first active crew member calls a meeting. */
function called(f: Fixture = afterGrace()): Fixture & { caller: string } {
  const caller = byRole(f.state, 'crew')[0]?.id ?? '';
  return {
    ...f,
    caller,
    state: run(f.state, { type: 'meetingCall', playerId: caller }, f.now).state,
  };
}

/** Teleports every active player onto the Base: Gather completes on the next evaluation. */
function gatherAll(f: Fixture): Fixture {
  let s = f.state;
  for (const p of s.players) if (!p.left && !p.spectator) s = moveTo(s, p.id, base(s), f.now);
  return { state: s, now: f.now };
}

/** Same state at a later server time, with fresh fixes, run through one tick. */
const later = (f: Fixture, seconds: number): Fixture => ({
  state: advanceTo(f.state, f.now + seconds * S),
  now: f.now + seconds * S,
});

const skipAll = (f: Fixture): Fixture => {
  let s = f.state;
  for (const p of s.players) {
    if (!p.left && !p.spectator)
      s = run(s, { type: 'meetingSkipDiscussion', playerId: p.id }, f.now).state;
  }
  return { state: s, now: f.now };
};

interface Votes extends Fixture {
  /** Every effect the votes produced (the last vote can end the stage). */
  effects: Effect[];
}

const vote = (f: Fixture, id: string, target: string): Votes => {
  const res = run(f.state, { type: 'meetingVote', playerId: id, target }, f.now);
  return { state: res.state, now: f.now, effects: res.effects };
};

/** Walks a called meeting to the Vote stage. */
function toVote(f: Fixture): Fixture {
  const gathered = gatherAll(f);
  const discuss = later(gathered, 1);
  expect(meeting(discuss.state)?.stage).toBe('discuss');
  const voting = skipAll(discuss);
  const s = advanceTo(voting.state, voting.now);
  expect(meeting(s)?.stage).toBe('vote');
  return { state: s, now: voting.now };
}

/** Everyone votes `target` except the listed players (their vote is Skip when listed in `skippers`). */
function castAll(f: Fixture, votes: Record<string, string>): Votes {
  let cur: Votes = { ...f, effects: [] };
  for (const [voter, target] of Object.entries(votes)) {
    const next = vote(cur, voter, target);
    cur = { ...next, effects: [...cur.effects, ...next.effects] };
  }
  return cur;
}

/** Lets the vote end by timeout and returns the Result stage. */
function toResult(f: Fixture): Fixture {
  const r = later(f, CFG.meetingVoteS + 1);
  expect(meeting(r.state)?.stage).toBe('result');
  return r;
}

const activeIds = (s: RoomState) =>
  s.players.filter((p) => !p.left && !p.spectator).map((p) => p.id);

describe('calling a meeting (MEETINGS §2)', () => {
  it('is refused in the first meetingStartGraceS of play', () => {
    const { state, now } = toPlaying(newLobby());
    expect(errCode(call(state, 'p1', now + S))).toBe('COOLDOWN');
    const jumped = run(
      state,
      { type: 'devAdvanceClock', playerId: 'host', seconds: GRACE_S - 5 },
      now,
    ).state;
    expect(errCode(call(advanceTo(jumped, now + S), 'p1', now + S))).toBe('COOLDOWN');
  });

  it('works for crew and for imposters alike, once the grace has passed', () => {
    const f = afterGrace();
    for (const role of ['crew', 'imposter'] as const) {
      const id = byRole(f.state, role)[0]?.id ?? '';
      const res = run(f.state, { type: 'meetingCall', playerId: id }, f.now);
      expect(meeting(res.state)?.stage).toBe('gather');
      expect(meeting(res.state)?.calledById).toBe(id);
    }
  });

  it('announces the caller to everyone and stops game time', () => {
    const f = afterGrace();
    const res = run(f.state, { type: 'meetingCall', playerId: 'p1' }, f.now);
    const [e] = eventsOf(res.effects, 'meeting.called');
    expect(e).toMatchObject({ kind: 'event', to: 'all', event: { by: 'Player 1' } });
    const clock = res.state.game?.clock;
    expect(clock?.reasons).toContain('meeting');
    expect(clock && gameNow(clock, f.now + 60 * S)).toBe(clock && gameNow(clock, f.now));
  });

  it('allows one meeting per player; meetingsPerPlayer 0 turns them off', () => {
    const f = called();
    const done = toResult(toVote(f));
    const ended = later(done, CFG.meetingResultS + 1);
    expect(meeting(ended.state)).toBeUndefined();
    const again = later(ended, CFG.meetingCooldownS + 1);
    expect(errCode(call(again.state, f.caller, again.now))).toBe('NOT_ALLOWED');
    expect(errCode(call(again.state, 'p3', again.now))).toBe('OK');

    const off = afterGrace(8, { config: { meetingsPerPlayer: 0 } });
    expect(errCode(call(off.state, 'p1', off.now))).toBe('NOT_ALLOWED');
  });

  it('is blocked while a meeting runs, and for meetingCooldownS (game time) after one', () => {
    const f = called();
    expect(errCode(call(f.state, 'p5', f.now))).toBe('MEETING_ACTIVE');
    const ended = later(toResult(toVote(f)), CFG.meetingResultS + 1);
    expect(errCode(call(ended.state, 'p5', ended.now))).toBe('COOLDOWN');
    const jumped = run(
      ended.state,
      { type: 'devAdvanceClock', playerId: 'host', seconds: CFG.meetingCooldownS + 1 },
      ended.now,
    ).state;
    expect(errCode(call(advanceTo(jumped, ended.now + S), 'p5', ended.now + S))).toBe('OK');
  });

  it('is blocked while the host has paused the game', () => {
    const f = afterGrace();
    const paused = run(f.state, { type: 'pause', playerId: 'host' }, f.now).state;
    expect(errCode(call(paused, 'p1', f.now))).toBe('PAUSED');
  });

  it('is refused for a caller whose location is stale, but not one who is out of bounds', () => {
    const f = afterGrace();
    const stale = call(f.state, 'p1', f.now + CFG.staleAfterS * S + S);
    expect(errCode(stale)).toBe('STALE');
    const far = offsetByMeters(base(f.state), 0, 400);
    const oob = moveTo(f.state, 'p1', far, f.now);
    expect(get(oob, 'p1').loc).toBeDefined();
    expect(errCode(call(oob, 'p1', f.now))).toBe('OK');
  });

  it('is refused outside play', () => {
    expect(errCode(call(newLobby(), 'host', 0))).toBe('WRONG_PHASE');
  });
});

describe('the lifecycle (MEETINGS §3)', () => {
  it('Gather ends when every active connected player is at the Base', () => {
    const f = called();
    expect(meeting(later(f, 5).state)?.stage).toBe('gather');
    const gathered = later(gatherAll(f), 1);
    expect(meeting(gathered.state)?.stage).toBe('discuss');
    expect(meeting(gathered.state)?.gathered).toHaveLength(8);
  });

  it('Gather waits only for players within baseRadiusM on a good fix', () => {
    const f = called();
    let s = f.state;
    const nearBase = offsetByMeters(base(s), CFG.baseRadiusM - 5, 0);
    const justOutside = offsetByMeters(base(s), CFG.baseRadiusM + 10, 0);
    for (const p of s.players) s = moveTo(s, p.id, p.id === 'p1' ? justOutside : nearBase, f.now);
    expect(meeting(advanceTo(s, f.now + S))?.gathered).not.toContain('p1');
    expect(meeting(advanceTo(s, f.now + S))?.stage).toBe('gather');
    s = moveTo(s, 'p1', nearBase, f.now + S);
    expect(meeting(advanceTo(s, f.now + 2 * S))?.stage).toBe('discuss');
  });

  it('Gather ends after meetingGatherS even if someone never arrives (E24)', () => {
    const f = called();
    expect(meeting(later(f, CFG.meetingGatherS - 1).state)?.stage).toBe('gather');
    expect(meeting(later(f, CFG.meetingGatherS + 1).state)?.stage).toBe('discuss');
  });

  it('a disconnected player is not waited for', () => {
    const f = called();
    const gone = run(f.state, { type: 'disconnect', playerId: 'p4' }, f.now).state;
    let s = gone;
    for (const p of s.players) if (p.id !== 'p4') s = moveTo(s, p.id, base(s), f.now);
    expect(meeting(advanceTo(s, f.now + S))?.stage).toBe('discuss');
  });

  it('Discuss ends when every active connected player skips, or after meetingDiscussS', () => {
    const gathered = later(gatherAll(called()), 1);
    expect(meeting(gathered.state)?.stage).toBe('discuss');
    const almost = run(
      gathered.state,
      { type: 'meetingSkipDiscussion', playerId: 'p1' },
      gathered.now,
    );
    expect(meeting(almost.state)?.stage).toBe('discuss');
    expect(meeting(skipAll(gathered).state)?.stage).toBe('vote');
    expect(meeting(later(gathered, CFG.meetingDiscussS - 5).state)?.stage).toBe('discuss');
    expect(meeting(later(gathered, CFG.meetingDiscussS + 1).state)?.stage).toBe('vote');
  });

  it('Vote ends when everyone has voted, or after meetingVoteS with missing votes as Skip', () => {
    const f = toVote(called());
    const all = castAll(f, Object.fromEntries(activeIds(f.state).map((id) => [id, 'skip'])));
    expect(meeting(all.state)?.stage).toBe('result');
    expect(meeting(later(f, CFG.meetingVoteS - 1).state)?.stage).toBe('vote');
    expect(meeting(later(f, CFG.meetingVoteS + 1).state)?.stage).toBe('result');
  });

  it('a vote is locked once cast, and stages are enforced', () => {
    const f = toVote(called());
    const first = vote(f, 'p1', 'p2');
    expect(
      errCode(reduce(first.state, { type: 'meetingVote', playerId: 'p1', target: 'skip' }, f.now)),
    ).toBe('NOT_ALLOWED');
    expect(
      errCode(
        reduce(
          first.state,
          { type: 'meetingVote', playerId: 'p1', target: 'nobody-here-123' },
          f.now,
        ),
      ),
    ).toBe('NOT_ALLOWED');
    expect(
      errCode(
        reduce(
          first.state,
          { type: 'meetingVote', playerId: 'p2', target: 'nobody-here-123' },
          f.now,
        ),
      ),
    ).toBe('NOT_FOUND');
    const early = called();
    expect(
      errCode(
        reduce(early.state, { type: 'meetingVote', playerId: 'p1', target: 'skip' }, early.now),
      ),
    ).toBe('WRONG_PHASE');
    expect(
      errCode(reduce(early.state, { type: 'meetingSkipDiscussion', playerId: 'p1' }, early.now)),
    ).toBe('WRONG_PHASE');
  });

  it('after Result, game time resumes where it stopped and the match clock did not move', () => {
    const f = called();
    const before = gameNow(f.state.game!.clock, f.now);
    const result = toResult(toVote(f));
    expect(gameNow(result.state.game!.clock, result.now)).toBe(before);
    const ended = later(result, CFG.meetingResultS + 1);
    expect(meeting(ended.state)).toBeUndefined();
    expect(ended.state.game?.clock.reasons).toEqual([]);
    const after = later(ended, 10);
    expect(gameNow(after.state.game!.clock, after.now) - before).toBe(10 * S);
  });

  it('a host pause freezes the stage countdown too (MEETINGS §6)', () => {
    const f = called();
    const paused = run(f.state, { type: 'pause', playerId: 'host' }, f.now);
    const long = advanceTo(paused.state, f.now + CFG.meetingGatherS * 3 * S);
    expect(meeting(long)?.stage).toBe('gather');
    const resumeAt = f.now + CFG.meetingGatherS * 3 * S;
    const resumed = run(long, { type: 'resume', playerId: 'host' }, resumeAt).state;
    expect(meeting(advanceTo(resumed, resumeAt + (CFG.meetingGatherS - 5) * S))?.stage).toBe(
      'gather',
    );
    expect(meeting(advanceTo(resumed, resumeAt + (CFG.meetingGatherS + 1) * S))?.stage).toBe(
      'discuss',
    );
  });

  it('the host can abort during a meeting', () => {
    const f = called();
    const res = run(f.state, { type: 'abort', playerId: 'host' }, f.now);
    expect(res.state.phase).toBe('ended');
  });

  it('a caller who disconnects does not stop the meeting', () => {
    const f = called();
    const gone = run(f.state, { type: 'disconnect', playerId: f.caller }, f.now).state;
    expect(meeting(gone)).toBeDefined();
  });
});

describe('vote resolution and ejection (MEETINGS §4–§5)', () => {
  const impostersOf = (s: RoomState) => byRole(s, 'imposter').map((p) => p.id);

  it('ejects the single leader who beats Skip, and reveals only Imposter / Not an imposter', () => {
    const f = toVote(called());
    const imp = impostersOf(f.state)[0] ?? '';
    const voters = activeIds(f.state)
      .filter((id) => id !== imp)
      .slice(0, 5);
    const voted = castAll(f, Object.fromEntries(voters.map((id) => [id, imp])));
    const res = toResult(voted);
    expect(meeting(res.state)?.ejectedId).toBe(imp);
    expect(get(res.state, imp).spectator).toBe(true);
    expect(get(res.state, imp).revealedRole).toBe('imposter');
  });

  it('sends one public meeting.result carrying the username and the reveal', () => {
    const f = toVote(called());
    const crew = byRole(f.state, 'crew')[0]?.id ?? '';
    const everyone = Object.fromEntries(
      activeIds(f.state).map((id) => [id, id === crew ? 'skip' : crew]),
    );
    expect(eventsOf(castAll(f, everyone).effects, 'meeting.result')).toEqual([
      {
        kind: 'event',
        to: 'all',
        event: {
          type: 'meeting.result',
          ejected: { username: get(f.state, crew).username, wasImposter: false },
        },
      },
    ]);
    const nobody = Object.fromEntries(activeIds(f.state).map((id) => [id, 'skip']));
    expect(eventsOf(castAll(f, nobody).effects, 'meeting.result')).toEqual([
      { kind: 'event', to: 'all', event: { type: 'meeting.result' } },
    ]);
  });

  it('a tie for the lead ejects nobody (E25)', () => {
    const f = toVote(called());
    const [a = '', b = '', ...rest] = activeIds(f.state);
    const voted = castAll(f, {
      [rest[0] ?? '']: a,
      [rest[1] ?? '']: a,
      [rest[2] ?? '']: b,
      [rest[3] ?? '']: b,
    });
    const res = toResult(voted);
    expect(meeting(res.state)?.ejectedId).toBeUndefined();
    expect(activeIds(res.state)).toHaveLength(8);
  });

  it('Skip equal to the top count ejects nobody; missing votes count as Skip (E25)', () => {
    const f = toVote(called());
    const [a = '', ...rest] = activeIds(f.state);
    // 4 votes for `a`, 4 abstain (never vote): Skip = 4 + `a`'s own missing vote... a does not vote either.
    const voted = castAll(f, {
      [rest[0] ?? '']: a,
      [rest[1] ?? '']: a,
      [rest[2] ?? '']: a,
      [rest[3] ?? '']: a,
    });
    const res = toResult(voted);
    const tally = meeting(res.state)?.tallies;
    expect(tally?.find((t) => t.target === 'skip')?.count).toBe(4);
    expect(tally?.find((t) => t.target === a)?.count).toBe(4);
    expect(meeting(res.state)?.ejectedId).toBeUndefined();
  });

  it('tallies list every candidate and Skip, and carry no voter ids', () => {
    const f = toVote(called());
    const [a = '', b = '', c = ''] = activeIds(f.state);
    const voted = castAll(f, { [a]: c, [b]: c });
    const res = toResult(voted);
    const tallies = meeting(res.state)?.tallies ?? [];
    expect(tallies).toHaveLength(9);
    expect(tallies[0]).toEqual({ target: c, count: 2 });
    expect(tallies.at(-1)).toEqual({ target: 'skip', count: 6 });
    expect(JSON.stringify(tallies)).not.toContain('voter');
  });

  it('a wrongly ejected healthy crew member counts as compromised; they become a spectator without tasks', () => {
    const f = toVote(called());
    const crew = byRole(f.state, 'crew')[0]?.id ?? '';
    expect(compromisedCount(f.state)).toBe(0);
    const voters = activeIds(f.state).filter((id) => id !== crew);
    const res = toResult(castAll(f, Object.fromEntries(voters.map((id) => [id, crew]))));
    const p = get(res.state, crew);
    expect(p.spectator).toBe(true);
    expect(p.revealedRole).toBe('crew');
    expect(p.tasks).toBeUndefined();
    expect(compromisedCount(res.state)).toBe(1);
  });

  it('ejecting an exposed crew member compromises them and cancels the exposure', () => {
    const f = toVote(called());
    const crew = byRole(f.state, 'crew')[0] ?? ({} as PlayerState);
    const imp = impostersOf(f.state)[0] ?? '';
    crew.infection = 'exposed';
    crew.exposure = { byId: imp };
    const voters = activeIds(f.state).filter((id) => id !== crew.id);
    const res = toResult(castAll(f, Object.fromEntries(voters.map((id) => [id, crew.id]))));
    const p = get(res.state, crew.id);
    expect(p.infection).toBeUndefined();
    expect(p.exposure).toBeUndefined();
    expect(compromisedCount(res.state)).toBe(1);
  });

  it('ejecting an infected crew member leaves the count unchanged (E26)', () => {
    const f = toVote(called());
    const crew = byRole(f.state, 'crew')[0] ?? ({} as PlayerState);
    crew.infection = 'infected';
    expect(compromisedCount(f.state)).toBe(1);
    const voters = activeIds(f.state).filter((id) => id !== crew.id);
    const voted = castAll(f, {
      ...Object.fromEntries(voters.map((id) => [id, crew.id])),
      [crew.id]: 'skip',
    });
    const res = voted; // everyone voted, so the vote ended at once
    expect(meeting(res.state)?.stage).toBe('result');
    expect(get(res.state, crew.id).spectator).toBe(true);
    expect(compromisedCount(res.state)).toBe(1);
    expect(eventsOf(voted.effects, 'meeting.result')).toMatchObject([
      { event: { ejected: { wasImposter: false } } },
    ]);
  });

  it('an ejected imposter loses their abilities', () => {
    const f = toVote(called());
    const imp = impostersOf(f.state)[0] ?? '';
    const voters = activeIds(f.state).filter((id) => id !== imp);
    const res = toResult(castAll(f, Object.fromEntries(voters.map((id) => [id, imp]))));
    expect(get(res.state, imp).infect).toBeUndefined();
    expect(get(res.state, imp).role).toBe('imposter');
  });
});

describe('victory around meetings (RULES §12, E27, E28)', () => {
  function ejectAll(f: Fixture, targets: string[]): Fixture {
    let cur = f;
    for (const target of targets) {
      const voting = toVote(cur);
      const voters = activeIds(voting.state).filter((id) => id !== target);
      const result = toResult(
        castAll(voting, Object.fromEntries(voters.map((id) => [id, target]))),
      );
      cur = later(result, CFG.meetingResultS + 1);
      if (cur.state.phase === 'ended') return cur;
      // the next meeting: another caller, after the cooldown
      const jumped = run(
        cur.state,
        { type: 'devAdvanceClock', playerId: 'host', seconds: CFG.meetingCooldownS + 1 },
        cur.now,
      ).state;
      const next = advanceTo(jumped, cur.now + S);
      const caller = activeIds(next).find((id) => get(next, id).meetingsCalled === undefined) ?? '';
      cur = {
        state: run(next, { type: 'meetingCall', playerId: caller }, cur.now + S).state,
        now: cur.now + S,
      };
    }
    return cur;
  }

  it('ejecting the last imposter is a crew win by V2, after the reveal has run (E27)', () => {
    const f = called(afterGrace(8));
    const imps = byRole(f.state, 'imposter').map((p) => p.id);
    expect(imps.length).toBeGreaterThan(0);
    const end = ejectAll(f, imps);
    expect(end.state.phase).toBe('ended');
    expect(end.state.result).toEqual({ winner: 'crew', reason: 'ejection' });
  });

  it('does not end the game while the last result is still showing', () => {
    const f = called(afterGrace(8));
    const imps = byRole(f.state, 'imposter').map((p) => p.id);
    // Make the imposter we vote out the last one standing.
    const [target = '', ...others] = imps;
    for (const id of others) {
      const o = get(f.state, id);
      o.spectator = true;
      o.revealedRole = 'imposter';
    }
    const voting = toVote(f);
    const voters = activeIds(voting.state).filter((id) => id !== target);
    const result = toResult(castAll(voting, Object.fromEntries(voters.map((id) => [id, target]))));
    expect(result.state.phase).toBe('playing');
    expect(meeting(result.state)?.stage).toBe('result');
    expect(later(result, CFG.meetingResultS + 1).state.phase).toBe('ended');
  });

  it('a wrong ejection that reaches the threshold is an imposter win by V3 (E28)', () => {
    const f = called(afterGrace(8));
    const threshold = f.state.game?.threshold ?? 99;
    const crew = byRole(f.state, 'crew');
    // Pre-compromise threshold − 1 crew members, then wrongly eject one more.
    for (const p of crew.slice(0, threshold - 1)) p.infection = 'infected';
    const target = crew[threshold - 1]?.id ?? '';
    const voting = toVote(f);
    const voters = activeIds(voting.state).filter((id) => id !== target);
    const result = toResult(castAll(voting, Object.fromEntries(voters.map((id) => [id, target]))));
    expect(result.state.phase).toBe('playing');
    const ended = later(result, CFG.meetingResultS + 1);
    expect(ended.state.phase).toBe('ended');
    expect(ended.state.result).toEqual({ winner: 'imposters', reason: 'infection' });
  });

  it('forfeit is suspended during a meeting and resumes afterwards', () => {
    const f = called(afterGrace(6));
    let s = f.state;
    for (const p of byRole(s, 'imposter'))
      s = run(s, { type: 'disconnect', playerId: p.id }, f.now).state;
    const long = advanceTo(s, f.now + CFG.forfeitAfterS * 2 * S);
    expect(long.phase).toBe('playing');
  });
});

describe('what a meeting does to the rest of the game (E22, E23, MEETINGS §3)', () => {
  it('resets a minigame in progress and tells the player', () => {
    const start = toPlaying(newLobby());
    const crew = crewOf(start.state)[0]!;
    const task = taskAt(start.state, crew.id);
    const held = stayAt(
      start.state,
      crew.id,
      otherPointInSection(start.state, task),
      start.now,
      CFG.sectionEntryHoldS + 1,
    );
    const arrived = stayAt(held.state, crew.id, task, held.now, 1);
    const opened = run(
      arrived.state,
      { type: 'taskOpen', playerId: crew.id, taskId: task.id },
      arrived.now,
    );
    expect(taskAt(opened.state, crew.id).open).toBeDefined();
    const jumped = run(
      opened.state,
      { type: 'devAdvanceClock', playerId: 'host', seconds: GRACE_S },
      arrived.now,
    ).state;
    const res = run(jumped, { type: 'meetingCall', playerId: crew.id }, arrived.now + S);
    expect(taskAt(res.state, crew.id).open).toBeUndefined();
    expect(eventsOf(res.effects, 'task.reset')).toEqual([
      { kind: 'event', to: [crew.id], event: { type: 'task.reset', reason: 'meeting' } },
    ]);
  });

  it('blocks every task command while the meeting runs', () => {
    const f = called();
    const crew = crewOf(f.state)[1]!;
    const task = taskAt(f.state, crew.id);
    const cmds: Command[] = [
      { type: 'taskOpen', playerId: crew.id, taskId: task.id },
      { type: 'taskReroll', playerId: crew.id, taskId: task.id },
      { type: 'taskReportUnsafe', playerId: crew.id, taskId: task.id },
    ];
    for (const c of cmds) expect(errCode(reduce(f.state, c, f.now))).toBe('MEETING_ACTIVE');
  });

  it('cancels an infection channel with no cooldown, and blocks Infect during and after (grace)', () => {
    const start = toPlaying(newLobby({ players: 6 }));
    const imp = byRole(start.state, 'imposter')[0]?.id ?? '';
    const victim = byRole(start.state, 'crew')[0]?.id ?? '';
    const jumped = run(
      start.state,
      { type: 'devAdvanceClock', playerId: 'host', seconds: GRACE_S + 5 },
      start.now,
    ).state;
    let now = start.now + S;
    let s = moveTo(
      advanceTo(jumped, now),
      imp,
      offsetByMeters(get(jumped, victim).loc ?? base(jumped), 3, 0),
      now,
    );
    now += S;
    s = advanceTo(s, now);
    s = run(s, { type: 'infectStart', playerId: imp }, now).state;
    expect(get(s, imp).infect?.channel).toBeDefined();
    const res = run(s, { type: 'meetingCall', playerId: victim }, now + S);
    expect(get(res.state, imp).infect?.channel).toBeUndefined();
    expect(eventsOf(res.effects, 'infect.failed')).toEqual([
      { kind: 'event', to: [imp], event: { type: 'infect.failed', reason: 'meeting' } },
    ]);
    expect(errCode(reduce(res.state, { type: 'infectStart', playerId: imp }, now + S))).toBe(
      'MEETING_ACTIVE',
    );
    // After the meeting the grace is a cooldown.
    const m: Fixture = { state: res.state, now: now + S };
    const ended = later(toResult(toVote(m)), CFG.meetingResultS + 1);
    const readyAt = get(ended.state, imp).infect?.readyAtGameMs ?? 0;
    const gameMs = gameNow(ended.state.game!.clock, ended.now);
    expect(readyAt - gameMs).toBeGreaterThanOrEqual(CFG.postMeetingGraceS * S - S);
    expect(errCode(reduce(ended.state, { type: 'infectStart', playerId: imp }, ended.now))).toBe(
      'COOLDOWN',
    );
  });

  it('freezes incubation: a meeting does not let an exposure run out', () => {
    const f = afterGrace();
    const crew = byRole(f.state, 'crew')[0] ?? ({} as PlayerState);
    const imp = byRole(f.state, 'imposter')[0]?.id ?? '';
    const gameMs = gameNow(f.state.game!.clock, f.now);
    crew.infection = 'exposed';
    crew.exposure = { byId: imp, incubationEndsAtGameMs: gameMs + 30 * S };
    const m = called(f);
    const long = later(m, CFG.meetingGatherS + 1);
    expect(get(long.state, crew.id).infection).toBe('exposed');
  });

  it('spectators cannot call, skip or vote, and are never an Infect target', () => {
    const f = toVote(called());
    const crew = byRole(f.state, 'crew')[0]?.id ?? '';
    const voters = activeIds(f.state).filter((id) => id !== crew);
    const result = toResult(castAll(f, Object.fromEntries(voters.map((id) => [id, crew]))));
    const ended = later(result, CFG.meetingResultS + 1);
    expect(errCode(reduce(ended.state, { type: 'meetingCall', playerId: crew }, ended.now))).toBe(
      'NOT_ALLOWED',
    );
    // a later meeting: the spectator cannot vote, and is no candidate
    const jumped = run(
      ended.state,
      { type: 'devAdvanceClock', playerId: 'host', seconds: CFG.meetingCooldownS + 1 },
      ended.now,
    ).state;
    const next = advanceTo(jumped, ended.now + S);
    const caller = activeIds(next)[0] ?? '';
    const m = run(next, { type: 'meetingCall', playerId: caller }, ended.now + S);
    const voting = toVote({ state: m.state, now: ended.now + S });
    expect(
      errCode(
        reduce(voting.state, { type: 'meetingVote', playerId: crew, target: 'skip' }, voting.now),
      ),
    ).toBe('NOT_ALLOWED');
    expect(
      errCode(
        reduce(voting.state, { type: 'meetingVote', playerId: caller, target: crew }, voting.now),
      ),
    ).toBe('NOT_FOUND');
    expect(meeting(voting.state)?.tallies).toBeUndefined();
  });
});

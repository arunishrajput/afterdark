import { offsetByMeters, type ResultsView } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import type { RoomState } from '../engine/state';
import { logEvent } from '../engine/systems/log';
import {
  advanceTo,
  crewOf,
  moveTo,
  newLobby,
  otherPointInSection,
  run,
  S,
  stayAt,
  taskAt,
  toPlaying,
} from '../engine/testkit';
import { projectResults, scoreSeriesOf } from './projectResults';
import { projectView } from './projectView';

interface Run {
  state: RoomState;
  now: number;
}

const roleIds = (s: RoomState, role: 'crew' | 'imposter') =>
  s.players.filter((p) => p.role === role).map((p) => p.id);

/** Step one second at a time for `seconds`, fixes refreshed. */
function walk(r: Run, seconds: number): Run {
  let { state, now } = r;
  for (let i = 0; i < seconds; i++) {
    now += S;
    state = advanceTo(state, now);
  }
  return { state, now };
}

/** A crew member finishes their first task through the real commands (the test-mode shortcut closes it). */
function finishTask(r: Run, id: string): Run {
  const task = taskAt(r.state, id);
  const held = stayAt(
    r.state,
    id,
    otherPointInSection(r.state, task),
    r.now,
    r.state.config.sectionEntryHoldS + 1,
  );
  const arrived = stayAt(held.state, id, task, held.now, 1);
  const opened = run(
    arrived.state,
    { type: 'taskOpen', playerId: id, taskId: task.id },
    arrived.now,
  );
  const done = run(
    opened.state,
    { type: 'devAutoComplete', playerId: id, taskId: task.id },
    arrived.now,
  );
  return { state: done.state, now: arrived.now };
}

/**
 * A scripted game on the real engine: one task, one infection (channel, then incubation), a pause, a
 * Task Stop, a meeting that ejects an imposter, and an abort. Returns the ended state.
 */
function scriptedGame(): {
  state: RoomState;
  crew: string;
  victim: string;
  imp: string;
  other: string;
} {
  const start = toPlaying(newLobby({ players: 6, config: { imposterAbilityMode: 'all' } }));
  let r: Run = start;
  const [imp = '', other = ''] = roleIds(r.state, 'imposter');
  const [crew = '', victim = ''] = roleIds(r.state, 'crew');
  r = finishTask(r, crew);

  // Everyone's cooldowns run out, then the first imposter infects the victim.
  r = {
    state: advanceTo(r.state, r.now + r.state.config.abilityInitialCooldownS * S),
    now: r.now + r.state.config.abilityInitialCooldownS * S,
  };
  const near = offsetByMeters(r.state.players.find((p) => p.id === victim)!.loc!, 3, 0);
  r = { state: moveTo(r.state, imp, near, r.now), now: r.now };
  r = { state: run(r.state, { type: 'infectStart', playerId: imp }, r.now).state, now: r.now };
  r = walk(r, r.state.config.infectionChannelS + 1);
  expect(r.state.players.find((p) => p.id === victim)?.infection).toBe('exposed');
  // The imposter leaves; the incubation runs out.
  const away = offsetByMeters(near, 60, 0);
  r = { state: moveTo(r.state, imp, away, r.now), now: r.now };
  for (
    let i = 0;
    i < 40 && r.state.players.find((p) => p.id === victim)?.infection !== 'infected';
    i++
  ) {
    r = walk(r, 5);
  }
  expect(r.state.players.find((p) => p.id === victim)?.infection).toBe('infected');

  // A host pause and a Task Stop by the other imposter.
  r = { state: run(r.state, { type: 'pause', playerId: 'host' }, r.now).state, now: r.now };
  r = {
    state: run(r.state, { type: 'resume', playerId: 'host' }, r.now + S).state,
    now: r.now + S,
  };
  r = {
    state: run(r.state, { type: 'abilityTaskStop', playerId: other }, r.now).state,
    now: r.now,
  };

  // A meeting: everyone gathers, skips the discussion, votes for the first imposter.
  r = {
    state: run(
      r.state,
      { type: 'devAdvanceClock', playerId: 'host', seconds: r.state.config.meetingStartGraceS },
      r.now,
    ).state,
    now: r.now,
  };
  r = { state: advanceTo(r.state, r.now + S), now: r.now + S };
  r = { state: run(r.state, { type: 'meetingCall', playerId: crew }, r.now).state, now: r.now };
  const base = r.state.setup.base!;
  let s = r.state;
  for (const p of s.players) s = moveTo(s, p.id, base, r.now);
  r = { state: advanceTo(s, r.now + S), now: r.now + S };
  for (const p of r.state.players)
    r = {
      state: run(r.state, { type: 'meetingSkipDiscussion', playerId: p.id }, r.now).state,
      now: r.now,
    };
  r = { state: advanceTo(r.state, r.now + S), now: r.now + S };
  for (const p of r.state.players)
    r = {
      state: run(r.state, { type: 'meetingVote', playerId: p.id, target: imp }, r.now).state,
      now: r.now,
    };
  r = { state: advanceTo(r.state, r.now + S), now: r.now + S };
  expect(r.state.game?.meeting?.stage).toBe('result');

  const ended = run(r.state, { type: 'abort', playerId: 'host' }, r.now + 20 * S).state;
  return { state: ended, crew, victim, imp, other };
}

describe('projectResults (SCORING › awards, PROTOCOL › ResultsView)', () => {
  const g = scriptedGame();
  const results = projectResults(g.state) as ResultsView;
  const player = (id: string) => results.players.find((p) => p.id === id)!;

  it('is absent before the game ends and for a room with no game', () => {
    const playing = toPlaying(newLobby({ players: 5 })).state;
    expect(projectResults(playing)).toBeUndefined();
    expect(projectResults(newLobby({ players: 5 }))).toBeUndefined();
  });

  it('reports the winner, reason and the final numbers', () => {
    expect(results.winner).toBeNull();
    expect(results.reason).toBe('abort');
    expect(results.aborted).toBe(true);
    expect(results.teamScore).toBe(g.state.game?.teamScore);
    expect(results.targetScore).toBe(g.state.config.targetScore);
    expect(results.compromised).toBeGreaterThanOrEqual(1);
    expect(results.threshold).toBe(g.state.game?.threshold);
    expect(results.crewCount).toBe(4);
    expect(results.durationS).toBeGreaterThan(g.state.config.meetingStartGraceS);
  });

  it('has a line for every player with the reveal and the stats', () => {
    expect(results.players.map((p) => p.id)).toEqual(g.state.players.map((p) => p.id));
    expect(player(g.crew)).toMatchObject({
      role: 'crew',
      tasksDone: 1,
      ejected: false,
      infections: 0,
    });
    expect(player(g.crew).personalScore).toBeGreaterThan(0);
    expect(player(g.imp)).toMatchObject({ role: 'imposter', infections: 1, ejected: true });
    expect(player(g.imp).classes?.length).toBe(3);
    expect(player(g.other)).toMatchObject({ role: 'imposter', infections: 0 });
    expect(player(g.victim).infectedAtS).toBeGreaterThan(0);
    expect(player(g.crew).infectedAtS).toBeUndefined();
    expect(player(g.crew).classes).toBeUndefined();
    expect(player(g.crew).tag).toBe(g.state.players.find((p) => p.id === g.crew)?.tag);
    expect(player(g.crew).meetingsCalled).toBe(1);
    for (const p of results.players) expect(Number.isInteger(p.distanceM)).toBe(true);
  });

  it('lists the timeline in order, with imposter → target for infections', () => {
    const kinds = results.timeline.map((t) => t.kind);
    expect(kinds).toEqual(['exposed', 'infected', 'paused', 'resumed', 'taskStop', 'ejected']);
    expect(results.timeline[0]).toMatchObject({ actorId: g.imp, targetId: g.victim });
    expect(results.timeline[1]).toMatchObject({ actorId: g.imp, targetId: g.victim });
    expect(results.timeline[4]).toMatchObject({ actorId: g.other });
    expect(results.timeline[5]).toMatchObject({ targetId: g.imp });
    const times = results.timeline.map((t) => t.atS);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('lists meetings with the caller, counts and the ejection, never per-voter choices', () => {
    expect(results.meetings).toHaveLength(1);
    const m = results.meetings[0]!;
    expect(m.calledById).toBe(g.crew);
    expect(m.ejectedId).toBe(g.imp);
    expect(m.wasImposter).toBe(true);
    expect(m.tallies.find((t) => t.target === g.imp)?.count).toBe(6);
    expect(Object.keys(m).sort()).toEqual([
      'atS',
      'calledById',
      'ejectedId',
      'tallies',
      'wasImposter',
    ]);
  });

  it('samples the team score and ends on the real final score', () => {
    const s = results.scoreSeries;
    expect(s[0]).toEqual({ atS: 0, team: 0 });
    expect(s.at(-1)).toEqual({ atS: results.durationS, team: results.teamScore });
    const teams = s.map((x) => x.team);
    expect(teams).toEqual([...teams].sort((a, b) => a - b));
    const step = g.state.config.scoreSampleS;
    expect(s[1]?.atS).toBe(step);
  });

  it('gives the awards, and leaves out the ones nobody earned', () => {
    expect(results.awards.crewMvp).toEqual({
      playerId: g.crew,
      value: player(g.crew).personalScore,
    });
    expect(results.awards.topInfector).toEqual({ playerId: g.imp, value: 1 });
    expect(results.awards.mostFooled).toBeUndefined();
  });

  it('counts fake tasks for most fooled, and a co-op for each crew participant', () => {
    const s = structuredClone(g.state);
    logEvent(s, s.game!.clock.gameMs, 'fooled', [g.victim], { by: g.other });
    logEvent(s, s.game!.clock.gameMs, 'fooled', [g.victim], { by: g.other });
    logEvent(s, s.game!.clock.gameMs, 'coop', [g.crew, g.other], { team: 12, personal: 5 });
    const r = projectResults(s) as ResultsView;
    expect(r.awards.mostFooled).toEqual({ playerId: g.victim, value: 2 });
    expect(r.players.find((p) => p.id === g.crew)?.tasksDone).toBe(2);
    expect(r.players.find((p) => p.id === g.other)?.tasksDone).toBe(0);
  });

  it('the view carries it only for the ended game, and the same for every viewer', () => {
    const now = results.durationS * 1000;
    const a = projectView(g.state, g.crew, now);
    const b = projectView(g.state, g.imp, now);
    expect(a.results).toEqual(results);
    expect(b.results).toEqual(results);
    const play = toPlaying(newLobby({ players: 5 }));
    expect(projectView(play.state, 'p1', play.now).results).toBeUndefined();
    expect(crewOf(play.state).length).toBeGreaterThan(0);
  });
});

describe('scoreSeriesOf', () => {
  it('steps through gains by game time and finishes on the final score', () => {
    const log = [
      { at: 0, gameMs: 20_000, type: 'task', actors: ['a'], data: { task: 'wires', points: 8 } },
      { at: 0, gameMs: 40_000, type: 'coop', actors: ['a', 'b'], data: { team: 12, personal: 5 } },
    ] as const;
    const series = scoreSeriesOf([...log], 70_000, 30, 20);
    expect(series).toEqual([
      { atS: 0, team: 0 },
      { atS: 30, team: 8 },
      { atS: 60, team: 20 },
      { atS: 70, team: 20 },
    ]);
  });
});

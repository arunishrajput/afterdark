import type { ResultsPlayer, ResultsView } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import {
  bannerFor,
  chartGeometry,
  clockOfSeconds,
  leaderboard,
  meetingText,
  revealOrder,
  shareText,
  timelineText,
} from './resultsState';

const player = (id: string, over: Partial<ResultsPlayer> = {}): ResultsPlayer => ({
  id,
  username: id.toUpperCase(),
  role: 'crew',
  tag: `T-${id}`,
  personalScore: 0,
  tasksDone: 0,
  fooled: 0,
  distanceM: 0,
  infections: 0,
  meetingsCalled: 0,
  ejected: false,
  left: false,
  ...over,
});

const results: ResultsView = {
  winner: 'crew',
  reason: 'score',
  aborted: false,
  teamScore: 130,
  targetScore: 130,
  compromised: 2,
  threshold: 5,
  crewCount: 6,
  durationS: 872,
  players: [
    player('ana', { role: 'imposter', classes: ['phantom'], infections: 2 }),
    player('ben', { personalScore: 40, tasksDone: 4 }),
    player('cy', { personalScore: 40, tasksDone: 5 }),
    player('di', { personalScore: 12 }),
  ],
  timeline: [],
  meetings: [],
  scoreSeries: [],
  awards: { crewMvp: { playerId: 'cy', value: 40 }, topInfector: { playerId: 'ana', value: 2 } },
};

describe('bannerFor', () => {
  it('names the winner and the reason, and an abort overrides both', () => {
    expect(bannerFor('crew', 'score')).toEqual({
      title: 'Crew wins',
      reason: 'The crew reached the target score.',
      tone: 'crew',
    });
    expect(bannerFor('imposters', 'infection').tone).toBe('imposters');
    expect(bannerFor('draw', 'forfeit')).toMatchObject({ title: 'It’s a draw', tone: 'draw' });
    expect(bannerFor(null, 'abort')).toMatchObject({ title: 'Aborted by host', tone: 'aborted' });
  });
});

describe('ordering', () => {
  it('ranks by score, then tasks, then name', () => {
    expect(leaderboard(results.players).map((p) => p.id)).toEqual(['cy', 'ben', 'di', 'ana']);
  });
  it('reveals imposters first', () => {
    expect(revealOrder(results.players).map((p) => p.id)).toEqual(['ana', 'ben', 'cy', 'di']);
  });
});

describe('text', () => {
  it('formats game seconds as a clock', () => {
    expect(clockOfSeconds(872)).toBe('14:32');
    expect(clockOfSeconds(0)).toBe('00:00');
  });

  it('writes timeline lines with names and roles', () => {
    expect(
      timelineText(results, { atS: 60, kind: 'exposed', actorId: 'ana', targetId: 'ben' }),
    ).toBe('ANA exposed BEN');
    expect(
      timelineText(results, { atS: 90, kind: 'infected', actorId: 'ana', targetId: 'ben' }),
    ).toBe('BEN became infected (exposed by ANA)');
    expect(timelineText(results, { atS: 99, kind: 'ejected', targetId: 'ana' })).toBe(
      'ANA was ejected (Imposter)',
    );
    expect(timelineText(results, { atS: 1, kind: 'paused' })).toBe('The host paused the game');
  });

  it('summarises a meeting with counts only and hides empty rows', () => {
    const m = meetingText(results, {
      atS: 300,
      calledById: 'ben',
      tallies: [
        { target: 'ana', count: 3 },
        { target: 'di', count: 0 },
        { target: 'skip', count: 1 },
      ],
      ejectedId: 'ana',
      wasImposter: true,
    });
    expect(m.headline).toBe('05:00 · called by BEN');
    expect(m.outcome).toBe('ANA was ejected (Imposter)');
    expect(m.rows).toEqual([
      { label: 'ANA', count: 3, ejected: true },
      { label: 'Skip', count: 1, ejected: false },
    ]);
    expect(
      meetingText(results, { atS: 0, calledById: 'ben', tallies: [{ target: 'skip', count: 4 }] })
        .outcome,
    ).toBe('No one was ejected');
  });

  it('writes a short share text without positions or per-player roles', () => {
    const text = shareText(results, 'ABC234');
    expect(text).toBe(
      [
        'AfterDark · Crew wins',
        'Team score 130/130 · 14:32 played · 2/5 compromised',
        'Crew MVP: CY (40 pts)',
        'Top infector: ANA (2)',
        'Lobby ABC234',
      ].join('\n'),
    );
  });
});

describe('chartGeometry', () => {
  const series = [
    { atS: 0, team: 0 },
    { atS: 30, team: 20 },
    { atS: 60, team: 100 },
  ];
  it('maps time to x and score to y inside the padding, target line included', () => {
    const g = chartGeometry(series, 100, 300, 100, 10);
    expect(g.yMax).toBe(100);
    expect(g.line).toBe('10.0,90.0 150.0,74.0 290.0,10.0');
    expect(g.targetY).toBe(10);
    expect(g.end).toEqual({ x: 290, y: 10 });
  });
  it('grows the range when the score beat the target and survives an empty series', () => {
    expect(chartGeometry(series, 50, 300, 100, 10).yMax).toBe(100);
    const empty = chartGeometry([], 50, 300, 100, 10);
    expect(empty.line).toBe('');
    expect(empty.end).toEqual({ x: 10, y: 90 });
  });
});

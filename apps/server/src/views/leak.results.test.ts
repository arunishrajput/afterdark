/**
 * Leak tests for the end-of-game reveal (Phase 12, PROTOCOL › ResultsView). Everything in `results`
 * is secret while the game runs: before `ended` no view has a `results` key and none of its field
 * names appear anywhere, however much the engine has logged by then.
 */
import { describe, expect, it } from 'vitest';

import { logEvent } from '../engine/systems/log';
import { buildGameFixture, type GamePhaseFixture, keysDeep } from './leakHarness';
import { projectView } from './projectView';

/** Field names that exist only inside `results` (or only on the server, like the log and the walk counters). */
const RESULT_ONLY = [
  'results',
  'scoreSeries',
  'tasksDone',
  'distanceM',
  'infectedAtS',
  'aborted',
  'awards',
  'crewMvp',
  'topInfector',
  'mostFooled',
  'timeline',
  'durationS',
  'infections',
  'fooled',
  'meetingsCalled',
  'walkedM',
  'walkFrom',
  'log',
];

const names = (view: unknown) =>
  new Set(keysDeep(view).map((k) => k.split('.').pop()?.replace('[]', '')));

describe.each<GamePhaseFixture>(['spawning', 'reveal', 'playing'])(
  'leak: no results in the %s phase',
  (phase) => {
    const { state, now } = buildGameFixture({ players: 8, phase });
    if (state.game) {
      // A busy game: the log and the counters exist, and still none of it is projected.
      const s = state.game;
      logEvent(state, now, 'task', ['p1'], { task: 'wires', points: 8 });
      logEvent(state, now, 'infectDone', ['p2', 'p3'], {});
      logEvent(state, now, 'meetingResult', [], { tallies: [{ target: 'skip', count: 3 }] });
      state.players.forEach((p) => {
        p.walkedM = 321.9;
        p.walkFrom = { lat: 1, lng: 2 };
      });
      expect(s.log.length).toBeGreaterThan(3);
    }

    it('no view has a results key or any field name of one', () => {
      for (const p of state.players) {
        const view = projectView(state, p.id, now);
        expect(view.results).toBeUndefined();
        const seen = names(view);
        for (const bad of RESULT_ONLY) expect(seen.has(bad), `${p.id}: ${bad}`).toBe(false);
        expect(JSON.stringify(view)).not.toContain('321.9');
      }
    });
  },
);

describe('leak: results in the ended phase', () => {
  const { state, now } = buildGameFixture({ players: 8, phase: 'ended' });
  const views = state.players.map((p) => projectView(state, p.id, now));

  it('every viewer, crew, imposter or host, gets the same results', () => {
    const first = JSON.stringify(views[0]?.results);
    expect(first).toBeDefined();
    for (const v of views) expect(JSON.stringify(v.results)).toBe(first);
  });

  it('shows the reveal and no session token, and never who voted for whom', () => {
    const results = views[0]?.results;
    expect(results?.players.filter((p) => p.role === 'imposter')).toHaveLength(2);
    for (const p of results?.players ?? []) expect(p.tag).not.toBe('');
    const json = JSON.stringify(views[0]);
    for (const bad of ['token', 'votes', 'voter', 'disconnectedAt', 'radarSalt', 'secretSeed']) {
      expect(json).not.toContain(bad);
    }
  });
});

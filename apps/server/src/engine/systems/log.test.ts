import { describe, expect, it } from 'vitest';

import { newLobby, run, S, toPlaying } from '../testkit';
import { entriesOf, logEvent } from './log';

describe('event log (Phase 12, ADR-095)', () => {
  it('starts with the role assignment and records game time next to wall time', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    const log = state.game?.log ?? [];
    expect(log[0]).toMatchObject({ type: 'roles', actors: [], data: { imposters: 2, crew: 4 } });
    const paused = run(state, { type: 'pause', playerId: 'host' }, now + 10 * S).state;
    const resumed = run(paused, { type: 'resume', playerId: 'host' }, now + 40 * S).state;
    const after = run(resumed, { type: 'pause', playerId: 'host' }, now + 50 * S).state;
    const entries = [
      ...entriesOf(after.game?.log ?? [], 'pause'),
      ...entriesOf(after.game?.log ?? [], 'resume'),
    ];
    // The 30 s pause left no gap in game time: the second pause is 10 s of game time (but 40 s of wall time) after the first.
    const [p1, p2] = entriesOf(after.game?.log ?? [], 'pause');
    expect(p2!.gameMs - p1!.gameMs).toBe(10 * S);
    expect(p2!.at - p1!.at).toBe(40 * S);
    expect(entries).toHaveLength(3);
  });

  it('ends with the winner and reason', () => {
    const { state, now } = toPlaying(newLobby({ players: 5 }));
    const ended = run(state, { type: 'abort', playerId: 'host' }, now + 5 * S).state;
    expect(ended.game?.log.at(-1)).toMatchObject({
      type: 'end',
      data: { winner: null, reason: 'abort' },
    });
  });

  it('keeps at most eventLogMax entries, dropping the oldest', () => {
    const { state, now } = toPlaying(newLobby({ players: 5, config: { eventLogMax: 3 } }));
    const s = structuredClone(state);
    for (let i = 0; i < 6; i++) logEvent(s, now, 'zonePenalty', ['p1'], { points: i });
    const points = entriesOf(s.game?.log ?? [], 'zonePenalty').map((e) => e.data.points);
    expect(s.game?.log).toHaveLength(3);
    expect(points).toEqual([3, 4, 5]);
  });

  it('logs nothing when there is no game (an abort in the spawn phase)', () => {
    const s = newLobby({ players: 4 });
    logEvent(s, 0, 'pause', ['host'], {});
    expect(s.game).toBeUndefined();
  });
});

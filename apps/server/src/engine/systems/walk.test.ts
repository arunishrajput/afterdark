import { DEFAULT_CONFIG, offsetByMeters } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import type { RoomState } from '../state';
import { HOME, moveTo, newLobby, run, S, toPlaying } from '../testkit';

const STEP = DEFAULT_CONFIG.walkStepM;

/** Send a fix `eastM` metres east of HOME at `now` (ts = now). */
function fixAt(state: RoomState, id: string, eastM: number, now: number, accuracy = 5): RoomState {
  const at = offsetByMeters(HOME, eastM, 0);
  return run(state, { type: 'locUpdate', playerId: id, fix: { ...at, accuracy, ts: now } }, now)
    .state;
}

const walked = (s: RoomState, id: string) => s.players.find((p) => p.id === id)?.walkedM ?? 0;

describe('distance walked (results screen, ADR-095)', () => {
  it('adds up steps of at least walkStepM and ignores jitter', () => {
    const { state, now } = toPlaying(newLobby({ players: 4 }));
    let s = moveTo(state, 'p1', HOME, now);
    s = fixAt(s, 'p1', 0, now + S);
    const before = walked(s, 'p1');
    // Jitter well under the step adds nothing, however often it happens.
    for (let i = 1; i <= 10; i++) s = fixAt(s, 'p1', (i % 2) * 2, now + (i + 1) * S);
    expect(walked(s, 'p1')).toBe(before);
    // Real walking: 3 m every second for 20 s is 60 m.
    for (let i = 1; i <= 20; i++) s = fixAt(s, 'p1', 3 * i, now + (20 + i) * S);
    expect(walked(s, 'p1') - before).toBeGreaterThan(50);
    expect(walked(s, 'p1') - before).toBeLessThanOrEqual(60 + STEP);
  });

  it('does not count a weak fix, a teleport, or time before play', () => {
    const { state, now } = toPlaying(newLobby({ players: 4 }));
    let s = moveTo(state, 'p1', HOME, now);
    const base = walked(s, 'p1');
    s = fixAt(s, 'p1', 40, now + S, 80); // weak: ignored entirely
    expect(walked(s, 'p1')).toBe(base);
    s = moveTo(s, 'p1', offsetByMeters(HOME, 150, 0), now + 2 * S); // a teleport moves nobody
    s = fixAt(s, 'p1', 151, now + 3 * S);
    expect(walked(s, 'p1')).toBe(base);
  });

  it('is never counted outside play', () => {
    const lobby = newLobby({ players: 4 });
    let s = fixAt(lobby, 'p1', 0, 1_700_000_000_000);
    s = fixAt(s, 'p1', 30, 1_700_000_001_000);
    expect(walked(s, 'p1')).toBe(0);
  });
});

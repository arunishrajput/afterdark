import type { MeetingView } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { candidates, remainingMs, revealCopy, tallyRows } from './meetingState';

const roster: MeetingView['roster'] = [
  { playerId: 'a', username: 'Asha', status: 'active', connected: true },
  { playerId: 'b', username: 'Bo', status: 'active', connected: true },
  { playerId: 'c', username: 'Cy', status: 'spectator', connected: true },
];

describe('remainingMs', () => {
  it('counts down to endsAt and never goes negative', () => {
    expect(remainingMs({ endsAt: 10_000 }, 4_000)).toBe(6_000);
    expect(remainingMs({ endsAt: 10_000 }, 12_000)).toBe(0);
  });

  it('is frozen at the pause moment while the host has paused', () => {
    expect(remainingMs({ endsAt: 10_000, pausedAt: 7_000 }, 9_500)).toBe(3_000);
  });
});

describe('revealCopy (ADR-019)', () => {
  it('says Imposter or not an Imposter, and nothing else about the player', () => {
    expect(revealCopy({ ejectedId: 'a', ejectedUsername: 'Asha', wasImposter: true })).toEqual({
      headline: 'Asha was an Imposter',
      kind: 'imposter',
    });
    expect(revealCopy({ ejectedId: 'a', ejectedUsername: 'Asha', wasImposter: false })).toEqual({
      headline: 'Asha was not an Imposter',
      kind: 'crew',
    });
  });

  it('says no one was ejected when there is no ejection', () => {
    expect(revealCopy({}).headline).toBe('No one was ejected');
    expect(revealCopy(undefined).kind).toBe('none');
  });
});

describe('tallyRows', () => {
  it('labels players and Skip, scales bars to the largest count and marks the ejected row', () => {
    const rows = tallyRows({
      roster,
      tallies: [
        { target: 'b', count: 4 },
        { target: 'a', count: 2 },
        { target: 'skip', count: 1 },
      ],
      outcome: { ejectedId: 'b', ejectedUsername: 'Bo', wasImposter: false },
    });
    expect(rows.map((r) => [r.label, r.count, r.share, r.ejected])).toEqual([
      ['Bo', 4, 1, true],
      ['Asha', 2, 0.5, false],
      ['Skip', 1, 0.25, false],
    ]);
  });

  it('handles an all-zero tally without dividing by zero', () => {
    const rows = tallyRows({ roster, tallies: [{ target: 'skip', count: 0 }], outcome: {} });
    expect(rows[0]?.share).toBe(0);
  });
});

describe('candidates', () => {
  it('lists active players only', () => {
    expect(candidates({ roster }).map((r) => r.playerId)).toEqual(['a', 'b']);
  });
});

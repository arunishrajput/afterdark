import { describe, expect, it } from 'vitest';

import { resolveVote } from './meeting';

describe('resolveVote (MEETINGS §4)', () => {
  it('ejects the single leader who beats Skip', () => {
    expect(resolveVote({ byTarget: { a: 3, b: 1, c: 0 }, skip: 2 })).toBe('a');
  });

  it('ejects nobody when the leader only equals Skip (E25)', () => {
    expect(resolveVote({ byTarget: { a: 2, b: 1 }, skip: 2 })).toBeUndefined();
  });

  it('ejects nobody when Skip beats the leader', () => {
    expect(resolveVote({ byTarget: { a: 2 }, skip: 5 })).toBeUndefined();
  });

  it('ejects nobody on a tie for the lead', () => {
    expect(resolveVote({ byTarget: { a: 3, b: 3, c: 1 }, skip: 0 })).toBeUndefined();
  });

  it('ejects nobody when everyone skipped or nobody voted', () => {
    expect(resolveVote({ byTarget: { a: 0, b: 0 }, skip: 8 })).toBeUndefined();
    expect(resolveVote({ byTarget: {}, skip: 0 })).toBeUndefined();
  });

  it('a lone vote beats zero Skips', () => {
    expect(resolveVote({ byTarget: { a: 1, b: 0 }, skip: 0 })).toBe('a');
  });

  it('a tie below the top does not matter', () => {
    expect(resolveVote({ byTarget: { a: 4, b: 2, c: 2 }, skip: 1 })).toBe('a');
  });
});

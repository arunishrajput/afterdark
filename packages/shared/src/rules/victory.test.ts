import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import { infectionThreshold, winnerOnTimeUp } from './victory';

const cfg = DEFAULT_CONFIG;

describe('infectionThreshold (SCORING.md table)', () => {
  it.each([
    [3, 2],
    [4, 3],
    [5, 3],
    [6, 4],
    [7, 5],
    [9, 6],
  ])('%i crew need %i compromised at 60%%', (crew, expected) => {
    expect(infectionThreshold(cfg, crew)).toBe(expected);
  });

  it('does not suffer float error (100% of 7 is 7, 40% of 5 is 2)', () => {
    expect(infectionThreshold({ infectionWinPercent: 100 }, 7)).toBe(7);
    expect(infectionThreshold({ infectionWinPercent: 40 }, 5)).toBe(2);
    expect(infectionThreshold({ infectionWinPercent: 70 }, 10)).toBe(7);
  });
});

describe('winnerOnTimeUp (V4)', () => {
  const base = { targetScore: 100, threshold: 4 };

  it('crew win when their progress is higher', () => {
    expect(winnerOnTimeUp({ ...base, teamScore: 60, compromised: 1 })).toBe('crew');
  });

  it('imposters win when their progress is higher', () => {
    expect(winnerOnTimeUp({ ...base, teamScore: 20, compromised: 3 })).toBe('imposters');
  });

  it('is a draw when the fractions are exactly equal (50/100 vs 2/4)', () => {
    expect(winnerOnTimeUp({ ...base, teamScore: 50, compromised: 2 })).toBe('draw');
  });

  it('is a draw at 0 vs 0', () => {
    expect(winnerOnTimeUp({ ...base, teamScore: 0, compromised: 0 })).toBe('draw');
  });

  it('caps each side at 1, so overshooting does not beat a full bar', () => {
    expect(winnerOnTimeUp({ ...base, teamScore: 400, compromised: 4 })).toBe('draw');
  });

  it('compares exactly: 1/3 equals 2/6 where floats would differ', () => {
    expect(winnerOnTimeUp({ teamScore: 1, targetScore: 3, compromised: 2, threshold: 6 })).toBe(
      'draw',
    );
    expect(winnerOnTimeUp({ teamScore: 2, targetScore: 7, compromised: 3, threshold: 10 })).toBe(
      'imposters',
    );
  });
});

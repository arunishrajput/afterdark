import { describe, expect, it } from 'vitest';

import { HOW_TO_CARDS } from './howToPlayContent';

describe('How to play cards', () => {
  it('has the five cards in the specified order', () => {
    expect(HOW_TO_CARDS.map((c) => c.id)).toEqual([
      'goal',
      'tasks',
      'infection',
      'meetings',
      'safety',
    ]);
  });

  it('keeps each card short', () => {
    for (const c of HOW_TO_CARDS) {
      expect(c.lines.length).toBeLessThanOrEqual(3);
      expect(c.lines.join(' ').length).toBeLessThan(400);
    }
  });

  it('only mentions running to forbid it', () => {
    const text = HOW_TO_CARDS.flatMap((c) => c.lines).join(' ');
    for (const m of text.matchAll(/\b(run|running|sprint|hurry|rush)\b/gi)) {
      expect(text.slice(Math.max(0, m.index - 6), m.index).toLowerCase()).toBe('never ');
    }
  });
});

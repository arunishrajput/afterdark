import { describe, expect, it } from 'vitest';

import { createRng } from './rng';
import { drawTags, formatTag, TAG_PATTERN, TAG_WORDS } from './tags';

describe('tags', () => {
  it('has at least 40 distinct words', () => {
    expect(TAG_WORDS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(TAG_WORDS).size).toBe(TAG_WORDS.length);
  });

  it('formats WORD-NN with a zero-padded number', () => {
    expect(formatTag('RAVEN', 7)).toBe('RAVEN-07');
    expect(formatTag('OWL', 42)).toBe('OWL-42');
  });

  it('draws unique words in the WORD-NN shape, for the largest lobby too', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const tags = drawTags(createRng(seed), 12);
      expect(tags).toHaveLength(12);
      for (const t of tags) expect(t).toMatch(TAG_PATTERN);
      expect(new Set(tags.map((t) => t.split('-')[0])).size).toBe(12);
      for (const t of tags) {
        const n = Number(t.split('-')[1]);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(99);
      }
    }
  });

  it('is deterministic for a seed and differs between seeds', () => {
    expect(drawTags(createRng(9), 8)).toEqual(drawTags(createRng(9), 8));
    expect(drawTags(createRng(9), 8)).not.toEqual(drawTags(createRng(10), 8));
  });

  it('refuses more tags than words', () => {
    expect(() => drawTags(createRng(1), TAG_WORDS.length + 1)).toThrow(RangeError);
  });
});

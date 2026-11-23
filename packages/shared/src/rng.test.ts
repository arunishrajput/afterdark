import { describe, expect, it } from 'vitest';

import { createRng, hashSeed, mulberry32 } from './rng';

describe('mulberry32', () => {
  it('matches the reference implementation (golden values for seed 42)', () => {
    const next = mulberry32(42);
    const values = [next(), next(), next()];
    expect(values).toEqual([0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
  });

  it('is deterministic for the same seed and differs across seeds', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const c = mulberry32(8);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    const seqC = Array.from({ length: 5 }, () => c());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it('always returns values in [0, 1)', () => {
    const next = mulberry32(123);
    for (let i = 0; i < 10_000; i++) {
      const v = next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('hashSeed', () => {
  it('maps a string to a stable unsigned 32-bit integer', () => {
    const h = hashSeed('room-seed');
    expect(h).toBe(hashSeed('room-seed'));
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(hashSeed('room-seed-2')).not.toBe(h);
  });
});

describe('createRng', () => {
  it('accepts numeric and string seeds and reports the seed', () => {
    expect(createRng(5).seed).toBe(5);
    expect(createRng('abc').seed).toBe(hashSeed('abc'));
  });

  it('int(min, max) is inclusive and covers the whole range', () => {
    const rng = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) {
      const v = rng.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('int rejects an empty range', () => {
    expect(() => createRng(1).int(3, 2)).toThrow(RangeError);
  });

  it('pick returns an element and throws on an empty array', () => {
    const rng = createRng(2);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 50; i++) expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it('shuffle returns a permutation without mutating the input', () => {
    const rng = createRng(3);
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = rng.shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual(input);
    expect(createRng(3).shuffle(input)).toEqual(out);
  });

  it('chance(p) respects the edges', () => {
    const rng = createRng(4);
    for (let i = 0; i < 100; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });
});

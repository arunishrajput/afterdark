/**
 * Seeded pseudo-random numbers. The server engine never calls `Math.random()`
 * (Invariant 5): each Room owns an `Rng` built from a logged seed, so tests and
 * replays can reproduce every roll.
 */

/** Reference mulberry32: a fast 32-bit generator returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a: turns a string seed (e.g. a UUID) into an unsigned 32-bit integer. */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  /** The numeric seed actually used (log it so a run can be reproduced). */
  readonly seed: number;
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** A uniformly chosen element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** A shuffled copy (Fisher–Yates). The input is not mutated. */
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: number | string): Rng {
  const numericSeed = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
  const next = mulberry32(numericSeed);

  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`int(${min}, ${max}): need integers with min <= max`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };

  return {
    seed: numericSeed,
    next,
    int,
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new RangeError('pick() from an empty array');
      return items[int(0, items.length - 1)] as T;
    },
    shuffle: <T>(items: readonly T[]): T[] => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j] as T, out[i] as T];
      }
      return out;
    },
  };
}

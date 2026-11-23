import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from './config/defaults';
import { ID_ALPHABET, randomId, randomString } from './ids';

describe('randomId', () => {
  it('is URL-safe and at least 12 characters by default', () => {
    for (let i = 0; i < 200; i++) {
      const id = randomId();
      expect(id.length).toBeGreaterThanOrEqual(12);
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('honours a custom length and refuses lengths below 12', () => {
    expect(randomId(20)).toHaveLength(20);
    expect(() => randomId(11)).toThrow(RangeError);
  });

  it('does not repeat across many draws', () => {
    const ids = new Set(Array.from({ length: 5_000 }, () => randomId()));
    expect(ids.size).toBe(5_000);
  });
});

describe('randomString', () => {
  it('only uses the given alphabet (lobby code alphabet)', () => {
    const { lobbyCodeAlphabet, lobbyCodeLength } = DEFAULT_CONFIG;
    for (let i = 0; i < 500; i++) {
      const code = randomString(lobbyCodeLength, lobbyCodeAlphabet);
      expect(code).toHaveLength(lobbyCodeLength);
      for (const ch of code) expect(lobbyCodeAlphabet).toContain(ch);
    }
  });

  it('is unbiased enough: every symbol of a 3-letter alphabet appears', () => {
    const s = randomString(3_000, 'abc');
    const counts = { a: 0, b: 0, c: 0 };
    for (const ch of s) counts[ch as keyof typeof counts]++;
    for (const n of Object.values(counts)) {
      expect(n).toBeGreaterThan(850);
      expect(n).toBeLessThan(1_150);
    }
  });

  it('rejects empty or oversized alphabets', () => {
    expect(() => randomString(4, '')).toThrow(RangeError);
    expect(() => randomString(4, 'x'.repeat(257))).toThrow(RangeError);
  });

  it('the default id alphabet has 64 URL-safe symbols', () => {
    expect(ID_ALPHABET).toHaveLength(64);
    expect(new Set(ID_ALPHABET).size).toBe(64);
  });
});

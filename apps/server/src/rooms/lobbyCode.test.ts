import { createRng, DEFAULT_CONFIG, lobbyCodeSchema } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { cryptoCodeSource, generateLobbyCode, rngCodeSource } from './lobbyCode';

const { lobbyCodeLength: length, lobbyCodeAlphabet: alphabet } = DEFAULT_CONFIG;

describe('generateLobbyCode', () => {
  it('produces valid codes from the config alphabet (crypto source)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateLobbyCode(cryptoCodeSource, () => false);
      expect(code).toHaveLength(length);
      expect(lobbyCodeSchema.safeParse(code).success).toBe(true);
      for (const ch of code) expect(alphabet).toContain(ch);
    }
  });

  it('is deterministic with a seeded RNG source', () => {
    const a = generateLobbyCode(rngCodeSource(createRng(7)), () => false);
    const b = generateLobbyCode(rngCodeSource(createRng(7)), () => false);
    expect(a).toBe(b);
  });

  it('redraws until the code does not collide with a live lobby', () => {
    const rngA = createRng(99);
    const first = generateLobbyCode(rngCodeSource(rngA), () => false);
    // Same seed again, but the first draw is "taken": the generator must move on.
    const second = generateLobbyCode(rngCodeSource(createRng(99)), (c) => c === first);
    expect(second).not.toBe(first);
  });

  it('gives up after too many collisions instead of looping forever', () => {
    expect(() => generateLobbyCode(cryptoCodeSource, () => true)).toThrow(/lobby code/i);
  });
});

import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import { createRng } from '../rng';
import { minigameOf, MINIGAMES, pickMinigameType } from './index';

describe('registry', () => {
  it('has a game for every solo type, enabled by default', () => {
    expect(DEFAULT_CONFIG.minigamesEnabled).toHaveLength(7);
    for (const type of DEFAULT_CONFIG.minigamesEnabled) expect(MINIGAMES[type]).toBeDefined();
    expect(minigameOf('wires')?.type).toBe('wires');
    expect(minigameOf('keyfetch')?.type).toBe('keyfetch');
    expect(minigameOf('coop_pin')).toBeUndefined();
  });

  it('generates and accepts its own solution for every solo type', () => {
    for (const type of DEFAULT_CONFIG.minigamesEnabled) {
      const game = MINIGAMES[type];
      const ctx = { gameMs: 0, keyHeld: type === 'keyfetch' };
      const { puzzle, solution } = game.generate(createRng(3), 1, DEFAULT_CONFIG, ctx);
      // The lock only accepts a code it saw matched (no blind submits).
      if (type === 'lock') continue;
      expect(game.check(puzzle, solution, solution, undefined, ctx)).toBe('right');
    }
  });

  it('picks by weight across all 7 types (TASKS §2: 3, 3, 3, 2, 2, 2, 1)', () => {
    const rng = createRng(11);
    const counts: Record<string, number> = {};
    const N = 16_000;
    for (let i = 0; i < N; i++) {
      const t = pickMinigameType(rng, DEFAULT_CONFIG);
      counts[t] = (counts[t] ?? 0) + 1;
    }
    const total = 16;
    for (const [type, weight] of Object.entries(DEFAULT_CONFIG.minigameWeights)) {
      expect((counts[type] ?? 0) / N).toBeCloseTo(weight / total, 1);
    }
    const skewed = {
      ...DEFAULT_CONFIG,
      minigameWeights: { ...DEFAULT_CONFIG.minigameWeights, wires: 9 },
    };
    let w = 0;
    for (let i = 0; i < 2000; i++) if (pickMinigameType(rng, skewed) === 'wires') w++;
    expect(w / 2000).toBeCloseTo(9 / 22, 1);
  });

  it('only rolls what the host left enabled, honours exclusions, and fails loudly with nothing left', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      minigamesEnabled: ['wires', 'pattern'] as ('wires' | 'pattern')[],
    };
    const rng = createRng(2);
    for (let i = 0; i < 200; i++)
      expect(['wires', 'pattern']).toContain(pickMinigameType(rng, cfg));
    expect(pickMinigameType(createRng(1), cfg, ['wires'])).toBe('pattern');
    expect(() => pickMinigameType(createRng(1), cfg, ['wires', 'pattern'])).toThrow(RangeError);
    // Fakes never roll keyfetch even when it is the only heavy type.
    const heavy = {
      ...DEFAULT_CONFIG,
      minigameWeights: { ...DEFAULT_CONFIG.minigameWeights, keyfetch: 1000 },
    };
    for (let i = 0; i < 200; i++)
      expect(pickMinigameType(rng, heavy, ['keyfetch'])).not.toBe('keyfetch');
  });
});

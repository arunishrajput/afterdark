import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import { createRng } from '../rng';
import { minigameOf, MINIGAMES, pickMinigameType } from './index';

describe('registry', () => {
  it('has a game for every enabled type', () => {
    for (const type of DEFAULT_CONFIG.minigamesEnabled) expect(MINIGAMES[type]).toBeDefined();
    expect(minigameOf('wires')?.type).toBe('wires');
    expect(minigameOf('coop_pin')).toBeUndefined();
  });

  it('picks by weight among the enabled types that exist', () => {
    const rng = createRng(11);
    const counts = { wires: 0, lock: 0 };
    for (let i = 0; i < 2000; i++) {
      const t = pickMinigameType(rng, DEFAULT_CONFIG);
      expect(t === 'wires' || t === 'lock').toBe(true);
      counts[t as 'wires' | 'lock']++;
    }
    // wires 3 : lock 3
    expect(Math.abs(counts.wires - counts.lock)).toBeLessThan(250);
    const skewed = {
      ...DEFAULT_CONFIG,
      minigameWeights: { ...DEFAULT_CONFIG.minigameWeights, wires: 9 },
    };
    let w = 0;
    for (let i = 0; i < 2000; i++) if (pickMinigameType(rng, skewed) === 'wires') w++;
    expect(w / 2000).toBeCloseTo(0.75, 1);
  });

  it('ignores enabled types without a game, honours exclusions and fails loudly with nothing left', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      minigamesEnabled: ['wires', 'pattern'] as ('wires' | 'pattern')[],
    };
    expect(pickMinigameType(createRng(1), cfg)).toBe('wires');
    expect(() => pickMinigameType(createRng(1), cfg, ['wires'])).toThrow(RangeError);
  });
});

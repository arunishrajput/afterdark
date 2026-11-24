/**
 * Phase 14 security pass: every game's answer and action parsing survives
 * hostile bodies. Nothing throws, nothing hostile counts as right, and no body
 * can pollute `Object.prototype`.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import { createRng } from '../rng';
import { coopPinAnswerSchema } from './coopPin';
import { MINIGAMES } from './index';
import { CTX } from './testCtx';
import { SOLO_MINIGAME_TYPES } from './types';

const DEEP = 2000;
const deep = (): unknown => {
  let v: unknown = 0;
  for (let i = 0; i < DEEP; i++) v = [v];
  return v;
};

/** What a client could put in a 2 KB task body (and a few things JSON can't carry, for robustness). */
const HOSTILE: unknown[] = [
  undefined,
  null,
  0,
  -0,
  1e308,
  -1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  '',
  'x'.repeat(2000),
  true,
  [],
  [null],
  Array.from({ length: 500 }, (_, i) => i),
  {},
  JSON.parse('{"__proto__":{"polluted":true}}') as unknown,
  JSON.parse('{"constructor":{"prototype":{"polluted":true}}}') as unknown,
  { guess: JSON.parse('{"__proto__":{"polluted":true}}') as unknown },
  { guess: [1e308, -1, 0.5, Number.NaN] },
  { step: 'x'.repeat(500) },
  deep(),
];

const polluted = () => (Object.prototype as Record<string, unknown>).polluted;

describe('minigames against hostile bodies', () => {
  it.each(SOLO_MINIGAME_TYPES.map((t) => [t]))(
    '%s: check and act never throw or accept junk',
    (type) => {
      const game = MINIGAMES[type];
      for (let seed = 0; seed < 5; seed++) {
        const { puzzle, solution } = game.generate(createRng(seed), 1, DEFAULT_CONFIG, CTX);
        for (const body of HOSTILE) {
          expect(() => game.check(puzzle, solution, body, undefined, CTX)).not.toThrow();
          expect(game.check(puzzle, solution, body, undefined, CTX)).not.toBe('right');
          if (game.hasActions) {
            expect(() =>
              game.act(puzzle, solution, undefined, body, createRng(seed), CTX),
            ).not.toThrow();
          }
        }
      }
      expect(polluted()).toBeUndefined();
    },
  );

  it('the co-op PIN answer schema refuses every hostile body', () => {
    const schema = coopPinAnswerSchema(DEFAULT_CONFIG);
    for (const body of HOSTILE) expect(schema.safeParse(body).success).toBe(false);
    expect(polluted()).toBeUndefined();
  });
});

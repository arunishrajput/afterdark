import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../config/defaults';
import { createRng } from '../rng';
import { coopPinAnswerSchema, generateCoopPins, verifyCoopPin } from './coopPin';

const params = { coopPinDigits: DEFAULT_CONFIG.coopPinDigits };

describe('coop_pin (TASKS §5)', () => {
  it('makes two different PINs of the configured length', () => {
    for (let seed = 0; seed < 50; seed++) {
      const { owner, partner } = generateCoopPins(createRng(seed), params);
      expect(owner).toMatch(new RegExp(`^\\d{${params.coopPinDigits}}$`));
      expect(partner).toMatch(new RegExp(`^\\d{${params.coopPinDigits}}$`));
      expect(owner).not.toBe(partner);
    }
  });

  it('is reproducible from the seed', () => {
    expect(generateCoopPins(createRng(7), params)).toEqual(generateCoopPins(createRng(7), params));
  });

  it('keeps leading zeros', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 400; seed++) {
      const { owner } = generateCoopPins(createRng(seed), params);
      seen.add(owner[0] ?? '');
    }
    expect(seen.has('0')).toBe(true);
  });

  it('checks what a player typed against the other slot, never their own', () => {
    const pins = { owner: '1234', partner: '5678' };
    expect(verifyCoopPin(pins, 'owner', { pin: '5678' })).toBe(true);
    expect(verifyCoopPin(pins, 'partner', { pin: '1234' })).toBe(true);
    expect(verifyCoopPin(pins, 'owner', { pin: '1234' })).toBe(false);
    expect(verifyCoopPin(pins, 'partner', { pin: '5678' })).toBe(false);
  });

  it('only parses a string of digits of the right length', () => {
    const schema = coopPinAnswerSchema(params);
    expect(schema.safeParse({ pin: '0042' }).success).toBe(true);
    expect(schema.safeParse({ pin: '42' }).success).toBe(false);
    expect(schema.safeParse({ pin: '12a4' }).success).toBe(false);
    expect(schema.safeParse({ pin: 1234 }).success).toBe(false);
    expect(schema.safeParse({ pin: '1234', extra: 1 }).success).toBe(false);
    expect(schema.safeParse('1234').success).toBe(false);
  });
});

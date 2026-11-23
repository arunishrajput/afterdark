import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from './defaults';
import {
  EDITABLE_CONFIG_KEYS,
  editableConfigPatchSchema,
  editableNumberRange,
  gameConfigSchema,
  HOST_CONFIG_TIER,
} from './schema';

describe('gameConfigSchema', () => {
  it('accepts the defaults', () => {
    expect(gameConfigSchema.parse(DEFAULT_CONFIG)).toEqual(DEFAULT_CONFIG);
  });

  it('rejects unknown keys and missing keys', () => {
    expect(gameConfigSchema.safeParse({ ...DEFAULT_CONFIG, bogus: 1 }).success).toBe(false);
    const { playTimeMin: _omit, ...rest } = DEFAULT_CONFIG;
    expect(gameConfigSchema.safeParse(rest).success).toBe(false);
  });

  it('enforces the host ranges from CONFIG.md', () => {
    const bad = (patch: Record<string, unknown>) =>
      gameConfigSchema.safeParse({ ...DEFAULT_CONFIG, ...patch }).success;
    expect(bad({ playTimeMin: 9 })).toBe(false);
    expect(bad({ playTimeMin: 61 })).toBe(false);
    expect(bad({ playTimeMin: 10 })).toBe(true);
    expect(bad({ infectionRadiusM: 2 })).toBe(false);
    expect(bad({ infectionRadiusM: 15 })).toBe(true);
    expect(bad({ coopChance: 0.51 })).toBe(false);
    expect(bad({ coopChance: 0.3 })).toBe(true);
    expect(bad({ imposterCount: 4 })).toBe(false);
    expect(bad({ imposterCount: 'auto' })).toBe(true);
    expect(bad({ regionCount: 1 })).toBe(false);
    expect(bad({ regionCount: 6 })).toBe(true);
    expect(bad({ playerVisibility: 'everyone' })).toBe(false);
    expect(bad({ meetingsPerPlayer: 0 })).toBe(true);
    expect(bad({ playTimeMin: 25.5 })).toBe(false);
  });
});

describe('editable config', () => {
  it('every editable key has a host tier and exists in the defaults', () => {
    for (const key of EDITABLE_CONFIG_KEYS) {
      expect(HOST_CONFIG_TIER[key]).toMatch(/^(basic|advanced)$/);
      expect(key in DEFAULT_CONFIG).toBe(true);
    }
  });

  it('a patch may only touch editable keys', () => {
    expect(editableConfigPatchSchema.safeParse({ playTimeMin: 30 }).success).toBe(true);
    expect(editableConfigPatchSchema.safeParse({}).success).toBe(true);
    expect(editableConfigPatchSchema.safeParse({ maxPlayers: 20 }).success).toBe(false);
    expect(editableConfigPatchSchema.safeParse({ points: { wires: 99 } }).success).toBe(false);
  });

  it('a patch is range-checked', () => {
    expect(editableConfigPatchSchema.safeParse({ meetingVoteS: 10 }).success).toBe(false);
  });
});

describe('editableNumberRange', () => {
  it('reads ranges from the schema, including auto-or-number keys', () => {
    expect(editableNumberRange('playTimeMin')).toEqual({ min: 10, max: 60 });
    expect(editableNumberRange('meetingsPerPlayer')).toEqual({ min: 0, max: 3 });
    expect(editableNumberRange('imposterCount')).toEqual({ min: 1, max: 3 });
    expect(editableNumberRange('testMode')).toBeUndefined();
  });
});

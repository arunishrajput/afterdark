import {
  DEFAULT_CONFIG,
  EDITABLE_CONFIG_KEYS,
  editableNumberRange,
  HOST_CONFIG_TIER,
} from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { FIELDS, fieldsOfTier, formatValue, matchingPreset, PRESETS } from './settingsFields';

describe('settings fields', () => {
  it('cover every host-editable key exactly once (CONFIG.md ✅ and ⚙️)', () => {
    expect(FIELDS.map((f) => f.key).sort()).toEqual([...EDITABLE_CONFIG_KEYS].sort());
  });

  it('are split into basic and advanced exactly as HOST_CONFIG_TIER says', () => {
    for (const f of fieldsOfTier('basic')) expect(HOST_CONFIG_TIER[f.key]).toBe('basic');
    for (const f of fieldsOfTier('advanced')) expect(HOST_CONFIG_TIER[f.key]).toBe('advanced');
  });

  it('number steppers have a schema range, and the default sits inside it', () => {
    for (const f of FIELDS.filter((x) => x.kind === 'number')) {
      const range = editableNumberRange(f.key);
      expect(range, f.key).toBeDefined();
      const v = DEFAULT_CONFIG[f.key] as number;
      expect(v).toBeGreaterThanOrEqual(range?.min ?? Infinity);
      expect(v).toBeLessThanOrEqual(range?.max ?? -Infinity);
    }
  });

  it('presets are Quick 15/70, Standard 25/100 and Long 40/150, all inside the schema ranges', () => {
    expect(PRESETS.map((p) => [p.label, p.values.playTimeMin, p.values.targetScore])).toEqual([
      ['Quick', 15, 70],
      ['Standard', 25, 100],
      ['Long', 40, 150],
    ]);
    for (const p of PRESETS) {
      const time = editableNumberRange('playTimeMin');
      const target = editableNumberRange('targetScore');
      expect(p.values.playTimeMin).toBeGreaterThanOrEqual(time?.min ?? Infinity);
      expect(p.values.playTimeMin).toBeLessThanOrEqual(time?.max ?? -Infinity);
      expect(p.values.targetScore).toBeGreaterThanOrEqual(target?.min ?? Infinity);
      expect(p.values.targetScore).toBeLessThanOrEqual(target?.max ?? -Infinity);
    }
  });

  it('matchingPreset recognises the defaults as Standard', () => {
    expect(matchingPreset(DEFAULT_CONFIG)).toBe('standard');
    expect(matchingPreset({ playTimeMin: 20, targetScore: 100 })).toBeUndefined();
  });

  it('formats values for display', () => {
    const byKey = (k: string) => FIELDS.find((f) => f.key === k)!;
    expect(formatValue(byKey('coopChance'), 0.25)).toBe('25 %');
    expect(formatValue(byKey('playTimeMin'), 25)).toBe('25 min');
    expect(formatValue(byKey('imposterCount'), 'auto')).toBe('Auto');
    expect(formatValue(byKey('testMode'), true)).toBe('On');
  });
});

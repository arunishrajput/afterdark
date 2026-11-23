/**
 * Descriptors for every host-editable setting (CONFIG.md ✅ basic and ⚙️ advanced).
 * Ranges are read from the config schema (`editableNumberRange`), never repeated here.
 */
import {
  type EditableConfigKey,
  type GameConfigPublic,
  HOST_CONFIG_TIER,
  type HostConfigTier,
} from '@afterdark/shared';

export interface Option<V> {
  value: V;
  label: string;
}

interface Base {
  key: EditableConfigKey;
  label: string;
  hint?: string;
}

export interface NumberField extends Base {
  kind: 'number';
  step: number;
  unit?: string;
  /** Display multiplier (0.25 shown as 25 %). */
  scale?: number;
}
export interface ChoiceField extends Base {
  kind: 'choice';
  options: Option<string | number>[];
}
export interface ToggleField extends Base {
  kind: 'toggle';
}
export type Field = NumberField | ChoiceField | ToggleField;

const AUTO = 'auto';
const autoPlus = (from: number, to: number): Option<string | number>[] => [
  { value: AUTO, label: 'Auto' },
  ...Array.from({ length: to - from + 1 }, (_, i) => ({
    value: from + i,
    label: String(from + i),
  })),
];

export const FIELDS: Field[] = [
  { key: 'playTimeMin', kind: 'number', label: 'Play time', unit: 'min', step: 5 },
  { key: 'targetScore', kind: 'number', label: 'Target score', unit: 'pts', step: 10 },
  {
    key: 'imposterCount',
    kind: 'choice',
    label: 'Imposters',
    options: autoPlus(1, 3),
    hint: 'Auto: 1 for 4–5 players, 2 for 6–9, 3 for 10–12.',
  },
  {
    key: 'imposterAbilityMode',
    kind: 'choice',
    label: 'Imposter abilities',
    options: [
      { value: 'classes', label: 'One class each' },
      { value: 'all', label: 'All three' },
    ],
  },
  {
    key: 'playerVisibility',
    kind: 'choice',
    label: 'Who you see on the map',
    options: [
      { value: 'nearby', label: 'Nearby' },
      { value: 'regions', label: 'Regions' },
      { value: 'all', label: 'Everyone' },
    ],
  },
  { key: 'regionCount', kind: 'choice', label: 'Regions', options: autoPlus(2, 6) },
  { key: 'infectionRadiusM', kind: 'number', label: 'Infection radius', unit: 'm', step: 1 },
  { key: 'meetingsPerPlayer', kind: 'number', label: 'Meetings per player', step: 1 },
  { key: 'meetingDiscussS', kind: 'number', label: 'Discussion time', unit: 's', step: 15 },
  { key: 'meetingVoteS', kind: 'number', label: 'Voting time', unit: 's', step: 5 },
  {
    key: 'testMode',
    kind: 'toggle',
    label: 'Test mode',
    hint: 'Simulated GPS and bots. Everyone sees a badge.',
  },

  { key: 'spawnTimeoutS', kind: 'number', label: 'Spawn timeout', unit: 's', step: 30 },
  { key: 'nearbyRadiusM', kind: 'number', label: 'Nearby radius', unit: 'm', step: 10 },
  { key: 'reachRadiusM', kind: 'number', label: 'Reach radius', unit: 'm', step: 1 },
  {
    key: 'coopChance',
    kind: 'number',
    label: 'Co-op task chance',
    unit: '%',
    step: 0.05,
    scale: 100,
  },
  { key: 'infectionChannelS', kind: 'number', label: 'Infection channel', unit: 's', step: 1 },
  { key: 'incubationS', kind: 'number', label: 'Incubation', unit: 's', step: 10 },
  { key: 'infectionWinPercent', kind: 'number', label: 'Infection win at', unit: '%', step: 5 },
  { key: 'taskStopLockS', kind: 'number', label: 'Task Stop lock', unit: 's', step: 5 },
];

export const fieldsOfTier = (tier: HostConfigTier): Field[] =>
  FIELDS.filter((f) => HOST_CONFIG_TIER[f.key] === tier);

export interface Preset {
  id: 'quick' | 'standard' | 'long';
  label: string;
  values: Pick<GameConfigPublic, 'playTimeMin' | 'targetScore'>;
}

export const PRESETS: Preset[] = [
  { id: 'quick', label: 'Quick', values: { playTimeMin: 15, targetScore: 70 } },
  { id: 'standard', label: 'Standard', values: { playTimeMin: 25, targetScore: 100 } },
  { id: 'long', label: 'Long', values: { playTimeMin: 40, targetScore: 150 } },
];

/** Which preset the draft matches, if any. */
export function matchingPreset(
  c: Pick<GameConfigPublic, 'playTimeMin' | 'targetScore'>,
): Preset['id'] | undefined {
  return PRESETS.find(
    (p) => p.values.playTimeMin === c.playTimeMin && p.values.targetScore === c.targetScore,
  )?.id;
}

/** The display string for a setting's value (summary rows and steppers). */
export function formatValue(field: Field, value: GameConfigPublic[EditableConfigKey]): string {
  switch (field.kind) {
    case 'number': {
      const n = Number(value) * (field.scale ?? 1);
      const text = String(Math.round(n * 100) / 100);
      return field.unit ? `${text} ${field.unit}` : text;
    }
    case 'choice':
      return field.options.find((o) => o.value === value)?.label ?? String(value);
    case 'toggle':
      return value ? 'On' : 'Off';
  }
}

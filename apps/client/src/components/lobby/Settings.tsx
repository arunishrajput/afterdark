import {
  DEFAULT_CONFIG,
  EDITABLE_CONFIG_KEYS,
  type EditableConfigKey,
  editableNumberRange,
  type GameConfigEditablePatch,
  type GameConfigPublic,
  resolveImposterCount,
} from '@afterdark/shared';
import { useState } from 'react';

import { updateConfig } from '../../net/actions';
import { messageFor } from '../../net/errors';
import { useGame } from '../../store';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import {
  type ChoiceField,
  type Field,
  FIELDS,
  fieldsOfTier,
  formatValue,
  matchingPreset,
  type MultiField,
  type NumberField,
  PRESETS,
} from './settingsFields';

const FLOAT_DIGITS = 100;

function Stepper({
  field,
  value,
  onChange,
}: {
  field: NumberField;
  value: number;
  onChange: (v: number) => void;
}) {
  const range = editableNumberRange(field.key);
  if (!range) return null;
  const { min, max } = range;
  const set = (v: number) =>
    onChange(Math.min(max, Math.max(min, Math.round(v * FLOAT_DIGITS) / FLOAT_DIGITS)));
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 flex-1 font-medium">{field.label}</span>
      <div className="flex shrink-0 items-center gap-1" role="group" aria-label={field.label}>
        <Button
          variant="secondary"
          className="w-11 px-0"
          aria-label={`Decrease ${field.label}`}
          disabled={value <= min}
          onClick={() => set(value - field.step)}
        >
          −
        </Button>
        <output
          className="w-[5.25rem] text-center font-mono text-lg whitespace-nowrap"
          aria-live="polite"
        >
          {formatValue(field, value)}
        </output>
        <Button
          variant="secondary"
          className="w-11 px-0"
          aria-label={`Increase ${field.label}`}
          disabled={value >= max}
          onClick={() => set(value + field.step)}
        >
          +
        </Button>
      </div>
    </div>
  );
}

function Chips({
  field,
  value,
  onChange,
}: {
  field: ChoiceField;
  value: string | number;
  onChange: (v: string | number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium">{field.label}</span>
      <div role="radiogroup" aria-label={field.label} className="flex flex-wrap gap-1">
        {field.options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
            className="min-h-11 min-w-11 rounded-lg border border-white/15 px-3 font-semibold aria-checked:border-accent aria-checked:bg-accent aria-checked:text-bg"
          >
            {opt.label}
          </button>
        ))}
      </div>
      {field.hint && <p className="text-xs text-muted">{field.hint}</p>}
    </div>
  );
}

function Variety({
  field,
  value,
  onChange,
}: {
  field: MultiField;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (v: string) => {
    if (value.includes(v)) {
      if (value.length <= field.min) return;
      onChange(value.filter((x) => x !== v));
    } else {
      // Keep the list in the catalogue's order, so the same choice always compares equal.
      onChange(field.options.map((o) => o.value).filter((x) => x === v || value.includes(x)));
    }
  };
  return (
    <div className="flex flex-col gap-1.5" data-testid="setting-minigamesEnabled">
      <span className="font-medium">{field.label}</span>
      <div role="group" aria-label={field.label} className="flex flex-wrap gap-1">
        {field.options.map((opt) => {
          const on = value.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={on}
              data-testid={`variety-${opt.value}`}
              disabled={on && value.length <= field.min}
              onClick={() => toggle(opt.value)}
              className="min-h-11 rounded-lg border border-white/15 px-3 font-semibold aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-bg disabled:opacity-60"
            >
              {on ? '✓ ' : ''}
              {opt.label}
            </button>
          );
        })}
      </div>
      {field.hint && <p className="text-xs text-muted">{field.hint}</p>}
    </div>
  );
}

function Toggle({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3">
      <span>
        <span className="block font-medium">{field.label}</span>
        {field.hint && <span className="block text-xs text-muted">{field.hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        data-testid={`setting-${field.key}`}
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="size-6 accent-[var(--accent)]"
      />
    </label>
  );
}

export function SettingsSheet({
  open,
  config,
  playerCount,
  onClose,
}: {
  open: boolean;
  config: GameConfigPublic;
  playerCount: number;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(config);
  const [busy, setBusy] = useState(false);
  const pushToast = useGame((s) => s.pushToast);

  const set = <K extends EditableConfigKey>(key: K, value: GameConfigPublic[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const patch: GameConfigEditablePatch = {};
  for (const key of EDITABLE_CONFIG_KEYS) {
    if (JSON.stringify(draft[key]) !== JSON.stringify(config[key]))
      Object.assign(patch, { [key]: draft[key] });
  }
  const dirty = Object.keys(patch).length > 0;

  // Until the lobby has enough players, suggest for the smallest game that can start.
  const players = Math.max(playerCount, DEFAULT_CONFIG.minPlayers);
  const crew = Math.max(
    0,
    players - resolveImposterCount({ ...DEFAULT_CONFIG, ...draft }, players),
  );
  const suggestedTarget = DEFAULT_CONFIG.targetScoreHintPerCrew * crew;
  const preset = matchingPreset(draft);

  const save = async () => {
    setBusy(true);
    const res = await updateConfig(patch);
    setBusy(false);
    if (!res.ok) pushToast(messageFor(res.code));
    else onClose();
  };

  const render = (field: Field) => {
    const value = draft[field.key];
    switch (field.kind) {
      case 'number':
        return (
          <Stepper
            key={field.key}
            field={field}
            value={value as number}
            onChange={(v) => set(field.key, v as never)}
          />
        );
      case 'choice':
        return (
          <Chips
            key={field.key}
            field={field}
            value={value as string | number}
            onChange={(v) => set(field.key, v as never)}
          />
        );
      case 'multi':
        return (
          <Variety
            key={field.key}
            field={field}
            value={value as string[]}
            onChange={(v) => set(field.key, v as never)}
          />
        );
      case 'toggle':
        return (
          <Toggle
            key={field.key}
            field={field}
            value={value as boolean}
            onChange={(v) => set(field.key, v as never)}
          />
        );
    }
  };

  return (
    <Sheet open={open} title="Game settings" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="font-medium">Preset</span>
          <div role="radiogroup" aria-label="Preset" className="grid grid-cols-3 gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                data-testid={`preset-${p.id}`}
                aria-checked={preset === p.id}
                onClick={() => setDraft((d) => ({ ...d, ...p.values }))}
                className="min-h-12 rounded-lg border border-white/15 px-2 text-sm font-semibold aria-checked:border-accent aria-checked:bg-accent aria-checked:text-bg"
              >
                {p.label}
                <span className="block text-xs font-normal opacity-80">
                  {p.values.playTimeMin} min · {p.values.targetScore} pts
                </span>
              </button>
            ))}
          </div>
        </div>

        {fieldsOfTier('basic').map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            {render(f)}
            {f.key === 'targetScore' && (
              <p className="text-right text-xs text-muted" data-testid="target-hint">
                Suggested for {crew} crew: {suggestedTarget} pts
              </p>
            )}
          </div>
        ))}

        <details className="rounded-xl border border-white/10 p-3">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">Advanced</summary>
          <div className="mt-2 flex flex-col gap-4">{fieldsOfTier('advanced').map(render)}</div>
        </details>
      </div>
      <p className="mt-5 text-sm text-muted">Saving changes un-readies everyone.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button data-testid="settings-save" disabled={!dirty || busy} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </Sheet>
  );
}

const SUMMARY_KEYS: EditableConfigKey[] = [
  'playTimeMin',
  'targetScore',
  'imposterCount',
  'imposterAbilityMode',
  'playerVisibility',
  'meetingsPerPlayer',
  'infectionRadiusM',
];

/** What everyone sees: the rules they are committing to (RULES §3.6). */
export function SettingsSummary({ config }: { config: GameConfigPublic }) {
  const rows = SUMMARY_KEYS.flatMap((key) => {
    const field = FIELDS.find((f) => f.key === key);
    return field ? [[field.label, formatValue(field, config[key])] as const] : [];
  });
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm" data-testid="settings-summary">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-mono">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

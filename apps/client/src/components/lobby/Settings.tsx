import {
  editableNumberRange,
  type GameConfigEditablePatch,
  type GameConfigPublic,
} from '@afterdark/shared';
import { useState } from 'react';

import { updateConfig } from '../../net/actions';
import { messageFor } from '../../net/errors';
import { useGame } from '../../store';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';

type StepKey = 'playTimeMin' | 'targetScore' | 'meetingsPerPlayer';

/** Generic Phase 1 settings; ranges come from the config schema. */
const STEPPERS: { key: StepKey; label: string; unit: string; step: number }[] = [
  { key: 'playTimeMin', label: 'Play time', unit: 'min', step: 5 },
  { key: 'targetScore', label: 'Target score', unit: 'pts', step: 10 },
  { key: 'meetingsPerPlayer', label: 'Meetings per player', unit: '', step: 1 },
];

const imposterRange = editableNumberRange('imposterCount');
const IMPOSTER_OPTIONS: GameConfigPublic['imposterCount'][] = [
  'auto',
  ...(imposterRange
    ? Array.from(
        { length: imposterRange.max - imposterRange.min + 1 },
        (_, i) => imposterRange.min + i,
      )
    : []),
];

const imposterLabel = (v: GameConfigPublic['imposterCount']) => (v === 'auto' ? 'Auto' : String(v));

function Stepper({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-1" role="group" aria-label={label}>
        <Button
          variant="secondary"
          className="w-12 px-0"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => set(value - step)}
        >
          −
        </Button>
        <output className="w-20 text-center font-mono text-lg" aria-live="polite">
          {value}
          {unit && <span className="ml-1 text-sm text-muted">{unit}</span>}
        </output>
        <Button
          variant="secondary"
          className="w-12 px-0"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => set(value + step)}
        >
          +
        </Button>
      </div>
    </div>
  );
}

export function SettingsSheet({
  open,
  config,
  onClose,
}: {
  open: boolean;
  config: GameConfigPublic;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(config);
  const [busy, setBusy] = useState(false);
  const pushToast = useGame((s) => s.pushToast);

  const patch: GameConfigEditablePatch = {};
  for (const { key } of STEPPERS) if (draft[key] !== config[key]) patch[key] = draft[key];
  if (draft.imposterCount !== config.imposterCount) patch.imposterCount = draft.imposterCount;
  const dirty = Object.keys(patch).length > 0;

  const save = async () => {
    setBusy(true);
    const res = await updateConfig(patch);
    setBusy(false);
    if (!res.ok) pushToast(messageFor(res.code));
    else onClose();
  };

  return (
    <Sheet open={open} title="Game settings" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {STEPPERS.map(({ key, label, unit, step }) => {
          const range = editableNumberRange(key);
          if (!range) return null;
          return (
            <Stepper
              key={key}
              label={label}
              unit={unit}
              step={step}
              {...range}
              value={draft[key]}
              onChange={(v) => setDraft({ ...draft, [key]: v })}
            />
          );
        })}
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">Imposters</span>
          <div role="radiogroup" aria-label="Imposters" className="flex gap-1">
            {IMPOSTER_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={draft.imposterCount === opt}
                onClick={() => setDraft({ ...draft, imposterCount: opt })}
                className="min-h-11 min-w-11 rounded-lg border border-white/15 px-2 font-semibold aria-checked:border-accent aria-checked:bg-accent aria-checked:text-bg"
              >
                {imposterLabel(opt)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-5 text-sm text-muted">Saving changes un-readies everyone.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!dirty || busy} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </Sheet>
  );
}

/** What everyone sees: the rules they are committing to (RULES §3.6). */
export function SettingsSummary({ config }: { config: GameConfigPublic }) {
  const rows: [string, string][] = [
    ['Play time', `${config.playTimeMin} min`],
    ['Target score', `${config.targetScore} pts`],
    ['Imposters', imposterLabel(config.imposterCount)],
    ['Meetings per player', String(config.meetingsPerPlayer)],
  ];
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

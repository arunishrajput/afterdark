/**
 * The host's setup wizard (PHASE-03 task 03.8): ① Boundary → ② Regions →
 * ③ Task points → ④ No-go zones → ⑤ Base → ⑥ Settings. Each step shows ✓ once it
 * is valid. The map reacts to the step (drawing tools, what a tap does); this
 * panel holds the step's buttons.
 */
import {
  DEFAULT_CONFIG,
  type PlayerView,
  pointsNeeded,
  type RegionPublic,
  summarizeSetup,
} from '@afterdark/shared';
import { useState } from 'react';

import { Button } from '../ui/Button';

export type StepId = 'boundary' | 'regions' | 'points' | 'nogo' | 'base' | 'settings';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'boundary', label: 'Boundary' },
  { id: 'regions', label: 'Regions' },
  { id: 'points', label: 'Task points' },
  { id: 'nogo', label: 'No-go' },
  { id: 'base', label: 'Base' },
  { id: 'settings', label: 'Settings' },
];

const REGION_COUNT_CHOICES = ['auto', 2, 3, 4, 5, 6] as const;

export interface WizardActions {
  setRegionCount: (count: 'auto' | number) => void;
  regenerateRegions: () => void;
  renameRegion: (regionId: string, name: string) => void;
  regeneratePoints: () => void;
  removeZone: (index: number) => void;
  clearZones: () => void;
  openSettings: () => void;
}

interface Props {
  view: PlayerView;
  step: StepId;
  onStep: (step: StepId) => void;
  previewRegionId: string | undefined;
  onPreview: (regionId: string | undefined) => void;
  actions: WizardActions;
}

function RegionNames({
  regions,
  onRename,
}: {
  regions: readonly RegionPublic[];
  onRename: (id: string, name: string) => void;
}) {
  const [editing, setEditing] = useState<string | undefined>();
  const [draft, setDraft] = useState('');
  const commit = (r: RegionPublic) => {
    setEditing(undefined);
    const name = draft.trim();
    if (name && name !== r.name) onRename(r.id, name);
  };
  return (
    <ul className="flex flex-col gap-1.5">
      {regions.map((r) => (
        <li key={r.id} className="flex items-center gap-2">
          {editing === r.id ? (
            <input
              autoFocus
              value={draft}
              maxLength={DEFAULT_CONFIG.regionNameMaxLen}
              aria-label={`Rename ${r.name}`}
              enterKeyHint="done"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit(r);
                if (e.key === 'Escape') setEditing(undefined);
              }}
              className="min-h-11 flex-1 rounded-lg border border-accent bg-bg px-3 text-base"
            />
          ) : (
            <button
              type="button"
              data-testid={`rename-${r.id}`}
              aria-label={`Rename ${r.name}`}
              onClick={() => {
                setDraft(r.name);
                setEditing(r.id);
              }}
              className="min-h-11 flex-1 rounded-lg border border-white/10 px-3 text-left hover:border-white/30"
            >
              {r.name} <span className="text-muted">✎</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SetupWizard({ view, step, onStep, previewRegionId, onPreview, actions }: Props) {
  const { lobby } = view;
  const { map } = lobby;
  const summary = summarizeSetup(
    { boundary: map.boundary, base: map.base, regions: map.regions, points: map.taskPoints },
    DEFAULT_CONFIG,
  );
  const needed = pointsNeeded(DEFAULT_CONFIG, lobby.players.length);
  const valid: Record<StepId, boolean> = {
    boundary: summary.boundarySet,
    regions: map.regions.length >= DEFAULT_CONFIG.minRegionsWithPoints,
    points:
      summary.usablePoints >= needed &&
      summary.regionsWithPoints >= DEFAULT_CONFIG.minRegionsWithPoints,
    nogo: true,
    base: summary.baseSet,
    settings: true,
  };
  const hasBoundary = summary.boundarySet;
  const previewOn = previewRegionId !== undefined;

  return (
    <div
      data-testid="setup-wizard"
      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-surface p-3"
    >
      <div role="tablist" aria-label="Setup steps" className="flex gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            role="tab"
            type="button"
            data-testid={`step-${s.id}`}
            aria-selected={step === s.id}
            onClick={() => onStep(s.id)}
            className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold ${step === s.id ? 'border-accent text-text' : 'border-white/10 text-muted'}`}
          >
            <span aria-hidden="true">{valid[s.id] ? '✓' : i + 1}</span>
            {s.label}
            <span className="sr-only">{valid[s.id] ? '(done)' : '(to do)'}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 text-sm" role="tabpanel">
        {step === 'boundary' && (
          <p>
            Draw the playable area with the tools on the map: a polygon, a rectangle or a circle.
            Pick “Edit” to move its corners.
          </p>
        )}

        {step === 'regions' && (
          <>
            {!hasBoundary ? (
              <p className="text-muted">Draw the boundary first.</p>
            ) : (
              <>
                <div role="group" aria-label="Number of regions" className="flex flex-wrap gap-1.5">
                  {REGION_COUNT_CHOICES.map((c) => (
                    <Button
                      key={c}
                      variant="secondary"
                      aria-pressed={lobby.config.regionCount === c}
                      onClick={() => actions.setRegionCount(c)}
                      className={`min-h-11 px-4 ${lobby.config.regionCount === c ? 'border-accent' : ''}`}
                    >
                      {c === 'auto' ? 'Auto' : c}
                    </Button>
                  ))}
                  <Button
                    variant="secondary"
                    data-testid="regenerate-regions"
                    className="min-h-11 px-4"
                    onClick={actions.regenerateRegions}
                  >
                    Regenerate
                  </Button>
                </div>
                <RegionNames regions={map.regions} onRename={actions.renameRegion} />
                <div role="group" aria-label="Preview sections" className="flex flex-col gap-1.5">
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      data-testid="preview-sections"
                      checked={previewOn}
                      onChange={(e) =>
                        onPreview(e.target.checked ? (map.regions[0]?.id ?? undefined) : undefined)
                      }
                      className="size-5"
                    />
                    Preview sections
                  </label>
                  {previewOn && (
                    <div className="flex flex-wrap gap-1.5">
                      {map.regions.map((r) => (
                        <Button
                          key={r.id}
                          variant="secondary"
                          aria-pressed={previewRegionId === r.id}
                          onClick={() => onPreview(r.id)}
                          className={`min-h-11 px-3 ${previewRegionId === r.id ? 'border-accent' : ''}`}
                        >
                          {r.name}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {step === 'points' && (
          <>
            <p>
              Tap the map to add a task point. Tap a point to delete it. Remove spots that are
              unsafe or unreachable.
            </p>
            <p data-testid="points-status" className={valid.points ? '' : 'text-danger'}>
              {summary.usablePoints} usable points (need {needed}) in {summary.regionsWithPoints}{' '}
              regions (need {DEFAULT_CONFIG.minRegionsWithPoints}).
            </p>
            <Button
              variant="secondary"
              data-testid="regenerate-points"
              disabled={!hasBoundary}
              onClick={actions.regeneratePoints}
              className="min-h-11 self-start px-4"
            >
              Regenerate points
            </Button>
          </>
        )}

        {step === 'nogo' && (
          <>
            <p>
              Optional. Draw polygons over roads, water or private property. Points inside them are
              removed and nobody is sent there.
            </p>
            {map.noGo.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {map.noGo.map((_, i) => (
                  // A zone has no id of its own; its position in the list is what the server uses.
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span>No-go zone {i + 1}</span>
                    <Button
                      variant="ghost"
                      className="min-h-11"
                      aria-label={`Remove no-go zone ${i + 1}`}
                      onClick={() => actions.removeZone(i)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {map.noGo.length > 1 && (
              <Button variant="ghost" className="min-h-11 self-start" onClick={actions.clearZones}>
                Remove all
              </Button>
            )}
          </>
        )}

        {step === 'base' && (
          <p data-testid="base-status">
            {map.base
              ? 'The Base ★ is where meetings gather. Tap the map to move it.'
              : 'Tap the map to place the Base, where meetings gather.'}
          </p>
        )}

        {step === 'settings' && (
          <Button variant="secondary" className="self-start" onClick={actions.openSettings}>
            Open settings
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * GPS simulator controls (TESTING §4): on/off, WASD or on-screen D-pad (1.4 m/s,
 * Shift = 3 m/s), an accuracy slider and a "go stale" switch. Long-press and
 * marker-drag teleports live on the map. The position it drives goes through
 * the same sender as real GPS.
 */
import { useEffect } from 'react';

import { Button } from '../components/ui/Button';
import { SIM_ACCURACY_MAX_M, SIM_ACCURACY_MIN_M, useLocation } from '../store/location';
import { keyFor, type Keys, NO_KEYS } from './walk';

type Dir = 'n' | 's' | 'e' | 'w';

const DPAD: { dir: Dir; label: string; area: string }[] = [
  { dir: 'n', label: '↑', area: 'col-start-2 row-start-1' },
  { dir: 'w', label: '←', area: 'col-start-1 row-start-2' },
  { dir: 's', label: '↓', area: 'col-start-2 row-start-2' },
  { dir: 'e', label: '→', area: 'col-start-3 row-start-2' },
];

function setKeys(patch: Partial<Keys>) {
  const { sim, patchSim } = useLocation.getState();
  patchSim({ keys: { ...sim.keys, ...patch } });
}

/** WASD / arrows walk, Shift runs. Ignored while typing in a field. */
function useSimKeyboard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      if (e.key === 'Shift') {
        setKeys({ fast: down });
        return;
      }
      const k = keyFor(e.code);
      if (!k) return;
      e.preventDefault();
      setKeys({ [k]: down });
    };
    const kd = onKey(true);
    const ku = onKey(false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      useLocation.getState().patchSim({ keys: NO_KEYS });
    };
  }, [active]);
}

export function SimPanel() {
  const sim = useLocation((s) => s.sim);
  const patchSim = useLocation((s) => s.patchSim);
  useSimKeyboard(sim.on);

  return (
    <section
      aria-labelledby="sim-title"
      data-testid="sim-panel"
      className="rounded-2xl border border-danger/30 bg-surface p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="sim-title" className="font-display text-lg font-bold">
          Test tools
        </h2>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="sim-toggle"
            checked={sim.on}
            onChange={(e) => patchSim({ on: e.target.checked })}
            className="size-5 accent-[var(--danger)]"
          />
          Simulated GPS
        </label>
      </div>

      {!sim.on ? (
        <p className="text-sm text-muted">
          Using your real GPS. Turn on simulated GPS to walk with WASD or the D-pad, or long-press
          the map to teleport.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="grid grid-cols-3 grid-rows-2 gap-1" role="group" aria-label="Walk">
              {DPAD.map(({ dir, label, area }) => (
                <button
                  key={dir}
                  type="button"
                  aria-label={`Walk ${dir === 'n' ? 'north' : dir === 's' ? 'south' : dir === 'e' ? 'east' : 'west'}`}
                  className={`${area} flex size-12 touch-none items-center justify-center rounded-lg border border-white/15 bg-bg text-xl select-none active:border-accent active:bg-accent active:text-bg`}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setKeys({ [dir]: true });
                  }}
                  onPointerUp={() => setKeys({ [dir]: false })}
                  onPointerCancel={() => setKeys({ [dir]: false })}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              className="min-h-12 flex-1 text-sm"
              aria-pressed={sim.keys.fast}
              onClick={() => setKeys({ fast: !sim.keys.fast })}
            >
              {sim.keys.fast ? 'Running 3 m/s' : 'Walking 1.4 m/s'}
            </Button>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="flex justify-between">
              <span>GPS accuracy</span>
              <output className="font-mono">±{sim.accuracy} m</output>
            </span>
            <input
              type="range"
              min={SIM_ACCURACY_MIN_M}
              max={SIM_ACCURACY_MAX_M}
              step={1}
              value={sim.accuracy}
              onChange={(e) => patchSim({ accuracy: Number(e.target.value) })}
              aria-label="Simulated GPS accuracy in metres"
              className="accent-[var(--accent)]"
            />
          </label>

          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sim.stale}
              onChange={(e) => patchSim({ stale: e.target.checked })}
              className="size-5 accent-[var(--danger)]"
            />
            Go stale (stop sending fixes)
          </label>

          <p className="font-mono text-xs text-muted" data-testid="sim-position">
            {sim.lat.toFixed(5)}, {sim.lng.toFixed(5)}
          </p>
        </div>
      )}
    </section>
  );
}

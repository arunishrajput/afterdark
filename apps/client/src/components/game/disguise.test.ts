import type { PlayerView, TaskCard } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { cardsFor, disguiseFraction, disguiseOf, playTheme } from './disguise';

const card = (id: string): TaskCard => ({
  id,
  kind: 'solo',
  stage: 'assigned',
  regionId: 'r1',
  regionName: 'Region A',
  section: 'NE',
});

function view(role: 'crew' | 'imposter', until?: number): PlayerView {
  return {
    me: {
      role,
      ...(role === 'imposter'
        ? {
            imposter: {
              classes: ['camouflage'],
              allies: [],
              infect: { readyAt: 0 },
              abilities: [],
              fakes: [],
              compromisedIds: [],
              exposures: [],
              ...(until === undefined
                ? {}
                : { camouflage: { until, decoyTasks: [card('d1'), card('d2')] } }),
            },
          }
        : {}),
    },
    game: { regionCounts: [], tasks: [card('real')] },
  } as unknown as PlayerView;
}

describe('disguiseOf', () => {
  it('is on only until the deadline', () => {
    expect(disguiseOf(view('imposter', 1000), 999)?.until).toBe(1000);
    expect(disguiseOf(view('imposter', 1000), 1000)).toBeUndefined();
    expect(disguiseOf(view('imposter'), 0)).toBeUndefined();
    expect(disguiseOf(undefined, 0)).toBeUndefined();
  });
});

describe('cardsFor and playTheme', () => {
  it('puts decoys first, then the real cards', () => {
    const v = view('imposter', 1000);
    expect(cardsFor(v, disguiseOf(v, 0)).map((c) => c.id)).toEqual(['d1', 'd2', 'real']);
    expect(cardsFor(v, undefined).map((c) => c.id)).toEqual(['real']);
  });

  it('a disguised imposter wears crew blue, a plain one red, crew always blue', () => {
    expect(playTheme(view('imposter', 1000), 0)).toBe('crew');
    expect(playTheme(view('imposter', 1000), 1000)).toBe('imposter');
    expect(playTheme(view('imposter'), 0)).toBe('imposter');
    expect(playTheme(view('crew'), 0)).toBe('crew');
  });
});

describe('disguiseFraction', () => {
  it('runs from 1 to 0 and stays within bounds', () => {
    const d = { until: 10_000, decoyTasks: [] };
    expect(disguiseFraction(d, 0, 10_000)).toBe(1);
    expect(disguiseFraction(d, 5000, 10_000)).toBe(0.5);
    expect(disguiseFraction(d, 20_000, 10_000)).toBe(0);
    expect(disguiseFraction(d, -5000, 10_000)).toBe(1);
  });
});

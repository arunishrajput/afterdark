import type { Position } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { areaToLatLngs, ringToLatLngs, sameCorners } from './geo';

const sq: Position[] = [
  [77.2, 28.6],
  [77.21, 28.6],
  [77.21, 28.61],
  [77.2, 28.61],
  [77.2, 28.6],
];

describe('ringToLatLngs', () => {
  it('swaps to [lat, lng] and drops the closing point', () => {
    expect(ringToLatLngs(sq)).toEqual([
      [28.6, 77.2],
      [28.6, 77.21],
      [28.61, 77.21],
      [28.61, 77.2],
    ]);
  });
});

describe('sameCorners', () => {
  it('ignores the closing point', () => {
    expect(sameCorners(sq, sq.slice(0, -1))).toBe(true);
  });
  it('is false for a moved corner or a different length', () => {
    const moved = sq.map((p, i) => (i === 1 ? ([77.2101, 28.6] as Position) : p));
    expect(sameCorners(sq, moved)).toBe(false);
    expect(sameCorners(sq, sq.slice(0, -2))).toBe(false);
  });
});

describe('areaToLatLngs', () => {
  it('converts every part and hole to open [lat, lng] rings', () => {
    const hole: Position[] = [
      [77.203, 28.603],
      [77.206, 28.603],
      [77.206, 28.606],
      [77.203, 28.603],
    ];
    const out = areaToLatLngs([[sq, hole], [sq]]);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(2); // outer ring + hole
    expect(out[0]?.[0]).toEqual(ringToLatLngs(sq));
    expect(out[0]?.[1]).toHaveLength(3);
    expect(out[1]?.[0]?.[0]).toEqual([28.6, 77.2]);
  });

  it('keeps an empty area empty', () => {
    expect(areaToLatLngs([])).toEqual([]);
  });
});

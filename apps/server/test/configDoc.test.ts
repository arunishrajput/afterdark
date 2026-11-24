/**
 * docs/CONFIG.md must match `DEFAULT_CONFIG` (CLAUDE.md Invariant 6: "Keep docs/CONFIG.md in sync").
 * Every documented key exists in the code and every key in the code is documented; a default that
 * is a plain number, boolean or word must equal the code's.
 */
import { readFileSync } from 'node:fs';

import { DEFAULT_CONFIG } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

const DOC = readFileSync(new URL('../../../docs/CONFIG.md', import.meta.url), 'utf8');

interface Row {
  keys: string[];
  defaultCell: string;
}

/** Table rows whose first cell names config keys in backticks (`a`, `a` / `b`, `points.wires`). */
function rows(): Row[] {
  return DOC.split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => {
      const [keyCell = '', defaultCell = ''] = line
        .split('|')
        .slice(1)
        .map((c) => c.trim());
      const keys = [...keyCell.matchAll(/`([A-Za-z_][A-Za-z0-9_.]*)`/g)].map((m) => m[1] ?? '');
      return { keys, defaultCell };
    });
}

const config = DEFAULT_CONFIG as unknown as Record<string, unknown>;

function valueAt(path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], config);
}

/** The documented default as a value, when it is simple enough to compare; otherwise undefined. */
function parseDefault(cell: string): { value: unknown } | undefined {
  const plain = cell.replace(/`/g, '');
  if (/^-?\d+(\.\d+)?$/.test(plain)) return { value: Number(plain) };
  if (plain === 'true' || plain === 'false') return { value: plain === 'true' };
  if (/^`[a-z]+`$/.test(cell)) return { value: plain };
  return undefined;
}

describe('docs/CONFIG.md matches DEFAULT_CONFIG', () => {
  const documented = rows();

  it('documents every key in the code, and nothing that is not there', () => {
    const docKeys = new Set(documented.flatMap((r) => r.keys).map((k) => k.split('.')[0] ?? k));
    const codeKeys = new Set(Object.keys(DEFAULT_CONFIG));
    expect(
      [...codeKeys].filter((k) => !docKeys.has(k)).sort(),
      'in code, not in CONFIG.md',
    ).toEqual([]);
    expect(
      [...docKeys].filter((k) => !codeKeys.has(k)).sort(),
      'in CONFIG.md, not in code',
    ).toEqual([]);
  });

  it('every plain default (number, boolean, word) equals the code', () => {
    let compared = 0;
    for (const row of documented) {
      const [key] = row.keys;
      if (row.keys.length !== 1 || key === undefined) continue;
      const parsed = parseDefault(row.defaultCell);
      if (!parsed) continue;
      compared++;
      expect(valueAt(key), key).toEqual(parsed.value);
    }
    expect(compared).toBeGreaterThan(100);
  });

  it('a row with two keys lists both defaults ("2 / 16")', () => {
    for (const row of documented.filter((r) => r.keys.length === 2)) {
      const parts = row.defaultCell.split('/').map((s) => Number(s.trim()));
      expect(row.keys.map(valueAt), row.keys.join(' / ')).toEqual(parts);
    }
  });
});

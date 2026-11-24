/**
 * Safety copy lint (PHASE-13 §13.8, Invariant 10), kept with the server tests because they have Node types: nothing the player reads may tell them to run or hurry.
 * "run" is only allowed to forbid ("never run", "do not run"). Scans the client source's string literals and JSX text.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../client/src', import.meta.url));
const SKIP = /(\.test\.|[\\/]sim[\\/]|[\\/]node_modules[\\/])/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !SKIP.test(path) ? [path] : [];
  });
}

/** Quoted strings and JSX text on one line; comments and imports are left out. */
function copyIn(file: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((raw, i) => {
      const line = raw.trim();
      if (/^(\/\/|\*|\/\*|import )/.test(line)) return;
      for (const m of line.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)) {
        out.push({ line: i + 1, text: m[2] ?? '' });
      }
      for (const m of line.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) {
        out.push({ line: i + 1, text: m[1] ?? '' });
      }
      const jsx = /^[^<>{}=]*[A-Za-z][^<>{}=]*$/.test(line) && !/[;(]$/.test(line);
      if (jsx) out.push({ line: i + 1, text: line });
    });
  return out;
}

const BAD = /\b(run|running|sprint|sprinting|hurry|rush|dash)\b/i;
const FORBIDDING = /\b(never|not|don['’]t|do not|no)\s+(run|running|sprint|hurry|rush|dash)\b/i;
/** Programming words that are not copy: `run(`, a "running game" status, "running in another tab". */
const NOT_COPY = /\brun\s*\(|\brun\.|\bvoid run\b|\brunning (game|in another)\b/i;

describe('safety copy', () => {
  it('never tells a player to run or hurry', () => {
    const bad: string[] = [];
    for (const file of sources(SRC)) {
      for (const { line, text } of copyIn(file)) {
        if (BAD.test(text) && !FORBIDDING.test(text) && !NOT_COPY.test(text)) {
          bad.push(`${file.replace(SRC, 'src')}:${line}: ${text}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('does say never to run in the places that matter', () => {
    const all = sources(SRC)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    for (const needle of ['Walk, never run', 'Do not run', 'never run, and watch for traffic']) {
      expect(all).toContain(needle);
    }
  });
});

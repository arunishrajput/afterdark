// Renders a batch of frames of the Trailer composition into one contact sheet.
// Usage: node prep/stills.mjs out.png 1.5 3.2 6.0 ...   (times in seconds)
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const [out, ...times] = process.argv.slice(2);
const root = path.resolve(import.meta.dirname, '..');
const browserExecutable = readFileSync('/tmp/bx.txt', 'utf8').trim();
const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts') });
const comp = await selectComposition({ serveUrl, id: 'Trailer', inputProps: { withAudio: false }, browserExecutable });
const dir = path.join(root, 'out/cine-stills');
mkdirSync(dir, { recursive: true });
const files = [];
for (const t of times) {
  const frame = Math.min(comp.durationInFrames - 1, Math.round(Number(t) * 30));
  const file = path.join(dir, `f${String(frame).padStart(4, '0')}.png`);
  await renderStill({ composition: comp, serveUrl, frame, output: file, scale: 0.5, browserExecutable, inputProps: { withAudio: false } });
  files.push(file);
}
execFileSync('python3', ['/tmp/sheet.py', out, ...files]);
console.log('sheet', out, files.length);

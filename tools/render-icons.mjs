// Renders the PWA icon PNGs from the two SVG sources in apps/client/public (ADR-099).
// Usage: pnpm icons   (needs Playwright's Chromium: `pnpm exec playwright install chromium`)
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'client', 'public');
const JOBS = [
  { src: 'icon.svg', out: 'icon-192.png', size: 192 },
  { src: 'icon.svg', out: 'icon-512.png', size: 512 },
  { src: 'icon.svg', out: 'apple-touch-icon.png', size: 180, flat: true },
  { src: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512 },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const { src, out, size, flat } of JOBS) {
    await page.setViewportSize({ width: size, height: size });
    const svg = await readFile(join(PUBLIC, src), 'utf8');
    // iOS rounds the corners itself and paints transparency black: give it a square, full-bleed tile.
    const body = flat ? svg.replace(/rx="112"/g, 'rx="0"') : svg;
    await page.setContent(
      `<body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(body).toString('base64')}" width="${size}" height="${size}" style="display:block"></body>`,
    );
    await writeFile(join(PUBLIC, out), await page.screenshot({ omitBackground: true }));
    console.log(`${out} ${size}x${size}`);
  }
} finally {
  await browser.close();
}

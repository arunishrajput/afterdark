// Renders every logo file from the creator's master logo, apps/client/brand/afterdark-logo.png (ADR-111):
// the PWA icons, the favicon and the apple-touch icon (the emblem, without the wordmark, which is
// unreadable at icon size) into public/, and into src/assets/brand/ the Home hero (the whole logo) and
// the wordmark alone for the lobby header.
// Usage: pnpm icons   (needs Playwright's Chromium: `pnpm exec playwright install chromium`)
/* global document, Image -- the drawing runs inside the page */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const CLIENT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MASTER = join(CLIENT, 'brand', 'afterdark-logo.png');
const PUBLIC = join(CLIENT, 'public');
const ASSET_DIR = join(CLIENT, 'src', 'assets', 'brand');
/** The app background (tokens.css `--bg`, the manifest's colours). */
const BG = '#07080A';

/** Regions of the 1536 × 1024 master, in its pixels. */
const EMBLEM = { x: 300, y: 40, w: 936, h: 680 }; // pin, moon, stars, crewmate, ring, top of the globe
const FIGURE = { x: 575, y: 60, w: 450, h: 560 }; // pin and crewmate only: what still reads at 32 px
const WHOLE = { x: 0, y: 20, w: 1536, h: 984 }; // the full logo with its glow
const WORDMARK = { x: 220, y: 716, w: 1160, h: 259 }; // "AfterDark" and its swoosh

/**
 * `fit`: share of the square the region may fill. `round`: transparent rounded corners (an "any"
 * icon); without it the tile is full-bleed, as iOS and maskable icons want. `sharp`: no round fade
 * at the edges, which would eat the figure at favicon size.
 */
const ICONS = [
  { out: 'icon-192.png', size: 192, region: EMBLEM, fit: 0.98, round: true },
  { out: 'icon-512.png', size: 512, region: EMBLEM, fit: 0.98, round: true },
  { out: 'apple-touch-icon.png', size: 180, region: EMBLEM, fit: 1.02 },
  // Maskable: everything inside the central 80 % circle (the safe zone).
  { out: 'icon-maskable-512.png', size: 512, region: EMBLEM, fit: 0.74 },
  { out: 'favicon-32.png', size: 32, region: FIGURE, fit: 1, round: true, sharp: true },
];
const IMAGES = [
  { out: 'logo-768.webp', region: WHOLE, width: 768 },
  { out: 'logo-1536.webp', region: WHOLE, width: 1536 },
  { out: 'wordmark-480.webp', region: WORDMARK, width: 480 },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<body></body>');
  const src = `data:image/png;base64,${(await readFile(MASTER)).toString('base64')}`;
  const rendered = await page.evaluate(
    async ({ src, icons, images, bg }) => {
      const img = new Image();
      img.src = src;
      await img.decode();

      /** The region, scaled to fit `fit` of a size × size square, feathered into the background. */
      const icon = ({ size, region: r, fit, round, sharp }) => {
        const scale = Math.min((size * fit) / r.w, (size * fit) / r.h);
        const w = r.w * scale;
        const h = r.h * scale;
        const x = (size - w) / 2;
        const y = (size - h) / 2;

        const layer = document.createElement('canvas');
        layer.width = layer.height = size;
        const l = layer.getContext('2d');
        l.imageSmoothingQuality = 'high';
        l.drawImage(img, r.x, r.y, r.w, r.h, x, y, w, h);
        // Soften the cut edges (the glow runs off the region), and fade the globe out at the bottom.
        l.globalCompositeOperation = 'destination-in';
        if (!sharp) {
          const edge = l.createRadialGradient(
            size / 2,
            size / 2,
            size * 0.36,
            size / 2,
            size / 2,
            size * 0.62,
          );
          edge.addColorStop(0, '#000');
          edge.addColorStop(1, 'transparent');
          l.fillStyle = edge;
          l.fillRect(0, 0, size, size);
        }
        const foot = l.createLinearGradient(0, y + h * 0.72, 0, y + h);
        foot.addColorStop(0, '#000');
        foot.addColorStop(1, 'transparent');
        l.fillStyle = foot;
        l.fillRect(0, 0, size, size);

        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        if (round) {
          ctx.beginPath();
          ctx.roundRect(0, 0, size, size, size * 0.22);
          ctx.clip();
        }
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(layer, 0, 0);
        return c.toDataURL('image/png');
      };

      /** A region at `width`, as WebP; the page blends its black into the background in CSS. */
      const webImage = ({ region: r, width }) => {
        const height = Math.round((width * r.h) / r.w);
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, width, height);
        return { url: c.toDataURL('image/webp', 0.82), height };
      };

      return {
        icons: icons.map((j) => icon(j)),
        images: images.map((j) => webImage(j)),
      };
    },
    { src, icons: ICONS, images: IMAGES, bg: BG },
  );

  const bytes = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  for (const [i, { out, size }] of ICONS.entries()) {
    await writeFile(join(PUBLIC, out), bytes(rendered.icons[i]));
    console.log(`public/${out} ${size}x${size}`);
  }
  await mkdir(ASSET_DIR, { recursive: true });
  for (const [i, { out, width }] of IMAGES.entries()) {
    const { url, height } = rendered.images[i];
    await writeFile(join(ASSET_DIR, out), bytes(url));
    console.log(`src/assets/brand/${out} ${width}x${height}`);
  }
} finally {
  await browser.close();
}

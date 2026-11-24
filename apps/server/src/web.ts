/**
 * Production web layer: security headers, compression, and the built client with
 * the right cache rules (ARCHITECTURE §9). Not mounted in development, where
 * Vite serves the client and proxies the socket.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import compression from 'compression';
import express, { type Express, type Response } from 'express';
import helmet from 'helmet';

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const ONE_YEAR_MS = SECONDS_PER_YEAR * 1000;
/** Vite writes content-hashed files here, so they never change under the same name. */
const HASHED_DIR = `${path.sep}assets${path.sep}`;
/** Files that must always be revalidated, or a new deploy would never reach installed phones. */
const NO_CACHE_FILE =
  /(^|[\\/])(index\.html|sw\.js|registerSW\.js|workbox-[^\\/]*\.js|manifest\.webmanifest)$/;

export const TILE_HOST = 'https://tile.openstreetmap.org';
const FONT_CSS_HOST = 'https://fonts.googleapis.com';
const FONT_FILE_HOST = 'https://fonts.gstatic.com';

/** Helmet with a CSP that allows only our own origin, OSM tiles and Google Fonts. */
export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        // React and Leaflet set inline style attributes; scripts stay locked down.
        'style-src': ["'self'", "'unsafe-inline'", FONT_CSS_HOST],
        'font-src': ["'self'", FONT_FILE_HOST],
        'img-src': ["'self'", 'data:', 'blob:', TILE_HOST],
        // 'self' covers the same-origin WebSocket in current browsers.
        'connect-src': ["'self'", TILE_HOST], // the service worker fetches tiles for its cache
        'worker-src': ["'self'"],
        'manifest-src': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': [],
      },
    },
    // Geolocation is the point of the app; helmet does not touch Permissions-Policy.
    crossOriginEmbedderPolicy: false,
  });
}

function setCacheHeaders(res: Response, filePath: string): void {
  if (NO_CACHE_FILE.test(filePath)) {
    res.setHeader('Cache-Control', 'no-cache');
  } else if (filePath.includes(HASHED_DIR)) {
    res.setHeader('Cache-Control', `public, max-age=${SECONDS_PER_YEAR}, immutable`);
  } else {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}

/** Headers and compression for every response (mounted before any route). */
export function applyHardening(app: Express): void {
  app.use(securityHeaders());
  app.use(compression());
}

/** True when a browser's `Origin` is this server's own host. Requests without one (bots, tools) pass. */
export function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Mounts the static client and the SPA fallback. Returns false if there is no build. */
export function mountClient(app: Express, clientDir: string): boolean {
  const indexHtml = path.join(clientDir, 'index.html');
  if (!existsSync(indexHtml)) return false;

  app.use(
    express.static(clientDir, {
      index: false,
      maxAge: ONE_YEAR_MS,
      setHeaders: (res, filePath) => setCacheHeaders(res, filePath),
    }),
  );
  // SPA fallback: real routes get index.html, but a missing file (a path with an extension) is a true 404.
  app.get(/^\/(?!socket\.io\/)[^.]*$/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
  return true;
}

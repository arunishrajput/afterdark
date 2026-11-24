import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const TILE_URL = /^https:\/\/tile\.openstreetmap\.org\//;
const TILE_MAX_ENTRIES = 500;
const TILE_MAX_AGE_S = 7 * 24 * 60 * 60;
const BG = '#07080A';

/**
 * Where `pnpm dev` runs the game server (apps/server env PORT default). Override with
 * `AFTERDARK_SERVER_URL` when another app holds port 3000 (Playwright does this from `E2E_SERVER_PORT`).
 */
const SERVER_URL = process.env.AFTERDARK_SERVER_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt': a new build waits until the lobby or results screen, then asks (ADR-099).
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'AfterDark',
        short_name: 'AfterDark',
        description: 'A real-world GPS social-deduction game. Among Us, played on your feet.',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        theme_color: BG,
        background_color: BG,
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // index.html is NetworkFirst below; keep it out of the precache so a deploy can't be hidden by it.
        globIgnores: ['**/index.html'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'afterdark-shell', networkTimeoutSeconds: 4 },
          },
          {
            urlPattern: TILE_URL,
            handler: 'CacheFirst',
            options: {
              cacheName: 'afterdark-tiles',
              expiration: { maxEntries: TILE_MAX_ENTRIES, maxAgeSeconds: TILE_MAX_AGE_S },
              // Tiles load as no-cors images, so a good response is "opaque" (status 0).
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    // Listen on the LAN too, and accept cloudflared quick-tunnel hosts (`pnpm tunnel`).
    host: true,
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/socket.io': { target: SERVER_URL, ws: true },
      '/health': SERVER_URL,
      '/version': SERVER_URL,
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: {
      '/socket.io': { target: SERVER_URL, ws: true },
    },
  },
});

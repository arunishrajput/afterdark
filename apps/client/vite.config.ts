import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Where `pnpm dev` runs the game server (apps/server env PORT default). */
const SERVER_URL = 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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

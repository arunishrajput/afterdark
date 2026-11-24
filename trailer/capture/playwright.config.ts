import { defineConfig } from '@playwright/test';

// Capture rig for the trailer: runs the real server + client and plays one scripted game.
const SERVER_PORT = process.env.E2E_SERVER_PORT ?? '3000';
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
export default defineConfig({
  testDir: '.',
  testMatch: /(capture|minigames)\.spec\.ts/,
  timeout: 600_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173' },
  webServer: [
    {
      command: 'pnpm --filter @afterdark/server dev',
      env: { TEST_ROOM_SALT: 'e2e-a', PORT: SERVER_PORT },
      url: `${SERVER_URL}/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @afterdark/client dev',
      env: { AFTERDARK_SERVER_URL: SERVER_URL },
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});

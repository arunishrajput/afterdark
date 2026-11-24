import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
// 127.0.0.1, not localhost: another local dev server may hold [::1]:5173.
const CLIENT_URL = 'http://127.0.0.1:5173';
const PREVIEW_URL = 'http://127.0.0.1:4173';
// Another local app may hold port 3000: `E2E_SERVER_PORT=3100 pnpm e2e` moves the game server
// (the client dev and preview servers proxy to it).
const SERVER_PORT = process.env.E2E_SERVER_PORT ?? '3000';
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const SERVER_HEALTH_URL = `${SERVER_URL}/health`;
const WEB_SERVER_TIMEOUT_MS = 120_000;
// Pointing at a deployed server (e2e/prod-smoke.spec.ts): no local servers.
const REMOTE_URL = process.env.BASE_URL;
const E2E_ROOM_SALT = 'e2e-a';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: REMOTE_URL ?? CLIENT_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', testIgnore: /pwa\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    // The service worker only exists in the production build: this project uses `vite preview`.
    {
      name: 'pwa',
      testMatch: /pwa\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: REMOTE_URL ?? PREVIEW_URL },
    },
  ],
  webServer: REMOTE_URL
    ? []
    : [
        {
          command: 'pnpm --filter @afterdark/server dev',
          // A pinned room salt makes spawns and roles reproducible: with this salt, a human who hosts a
          // lobby of 8 is crew and a human who hosts a lobby of 5 is an imposter (e2e/game.spec.ts).
          env: { TEST_ROOM_SALT: E2E_ROOM_SALT, PORT: SERVER_PORT },
          url: SERVER_HEALTH_URL,
          reuseExistingServer: !isCI,
          timeout: WEB_SERVER_TIMEOUT_MS,
        },
        {
          command:
            'pnpm --filter @afterdark/client build && pnpm --filter @afterdark/client preview --host 127.0.0.1',
          env: { AFTERDARK_SERVER_URL: SERVER_URL },
          url: PREVIEW_URL,
          reuseExistingServer: !isCI,
          timeout: WEB_SERVER_TIMEOUT_MS,
        },
        {
          command: 'pnpm --filter @afterdark/client dev',
          env: { AFTERDARK_SERVER_URL: SERVER_URL },
          url: CLIENT_URL,
          reuseExistingServer: !isCI,
          timeout: WEB_SERVER_TIMEOUT_MS,
        },
      ],
});

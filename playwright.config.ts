import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
// 127.0.0.1, not localhost: another local dev server may hold [::1]:5173.
const CLIENT_URL = 'http://127.0.0.1:5173';
const SERVER_HEALTH_URL = 'http://127.0.0.1:3000/health';
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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: REMOTE_URL
    ? undefined
    : [
        {
          command: 'pnpm --filter @afterdark/server dev',
          // A pinned room salt makes spawns and roles reproducible: with this salt, a human who hosts a
          // lobby of 8 is crew and a human who hosts a lobby of 5 is an imposter (e2e/game.spec.ts).
          env: { TEST_ROOM_SALT: E2E_ROOM_SALT },
          url: SERVER_HEALTH_URL,
          reuseExistingServer: !isCI,
          timeout: WEB_SERVER_TIMEOUT_MS,
        },
        {
          command: 'pnpm --filter @afterdark/client dev',
          url: CLIENT_URL,
          reuseExistingServer: !isCI,
          timeout: WEB_SERVER_TIMEOUT_MS,
        },
      ],
});

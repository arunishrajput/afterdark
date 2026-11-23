import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
// 127.0.0.1, not localhost: another local dev server may hold [::1]:5173.
const CLIENT_URL = 'http://127.0.0.1:5173';
const SERVER_HEALTH_URL = 'http://127.0.0.1:3000/health';
const WEB_SERVER_TIMEOUT_MS = 120_000;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: CLIENT_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @afterdark/server dev',
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

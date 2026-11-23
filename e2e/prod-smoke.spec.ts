import { expect, test } from '@playwright/test';

import { lobbyWithBots, newPlayer, startAndReveal } from './helpers';

/**
 * Phase 6: smoke test of a deployed server.
 *   BASE_URL=https://<service>.onrender.com pnpm exec playwright test e2e/prod-smoke.spec.ts
 * The server needs `ALLOW_TEST_MODE=true`. Skipped without BASE_URL, so a plain `pnpm e2e` stays local.
 * Free-tier Render sleeps when idle: the first request can take about a minute.
 */
const BASE_URL = process.env.BASE_URL;
test.skip(!BASE_URL, 'set BASE_URL to run the production smoke test');
// Retries: a free-tier instance behind Render's edge and a home network occasionally reset a connection
// or answer a beat late (seen: ECONNRESET on /health, the map taking over 5 s to centre).
test.describe.configure({ timeout: 240_000, retries: 2 });

const COLD_START_MS = 120_000;
const BOTS = 3;

test('/health and /version answer, with security headers', async ({ request }) => {
  const health = await request.get('/health', { timeout: COLD_START_MS }); // wakes a sleeping service
  expect(health.ok()).toBe(true);
  expect(await health.json()).toEqual({ ok: true });
  expect(health.headers()['content-security-policy']).toContain('tile.openstreetmap.org');

  const version = await request.get('/version');
  const { sha } = (await version.json()) as { sha: string };
  expect(sha).toMatch(/^[0-9a-f]{40}$/);
  test.info().annotations.push({ type: 'deployed sha', description: sha });
});

test('the page connects over a live socket, and a test-mode lobby with 3 bots reaches the playing HUD', async ({
  browser,
}) => {
  const page = await newPlayer(browser);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'AfterDark' })).toBeVisible();
  await expect(page.getByTestId('connection-status')).toHaveText('Connected ✓', {
    timeout: COLD_START_MS,
  });
  await expect(page.getByTestId('app-version')).toHaveText(/^build [0-9a-f]{7}$/);

  // `?sim=1` (the helpers' default) starts the GPS simulator once the lobby is in test mode.
  await lobbyWithBots(page, BOTS);
  await startAndReveal(page);
  await expect(page.getByTestId('match-timer')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('map')).toBeVisible();
  await page.context().close();
});

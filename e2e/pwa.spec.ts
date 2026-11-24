import { expect, test } from '@playwright/test';

/**
 * Phase 13: runs against the production build (`vite preview`, see playwright.config.ts), because the
 * service worker only exists there.
 */

test('the manifest is installable and the icons load', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await request.get(href ?? '/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as {
    name: string;
    display: string;
    orientation: string;
    theme_color: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };
  expect(manifest).toMatchObject({
    name: 'AfterDark',
    display: 'standalone',
    orientation: 'portrait',
  });
  expect(manifest.theme_color).toBe('#07080A');
  expect(manifest.icons.map((i) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
});

test('the app shell loads with the network off', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  // The worker controls pages from the next navigation on (and caches that navigation).
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await page.reload();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'AfterDark' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create game' })).toBeVisible();
  await page.screenshot({ path: 'test-results/phase13/offline-shell.png' });
  await context.setOffline(false);
});

import { expect, test } from '@playwright/test';

test('the client connects to the server and shows a ping', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'AfterDark' })).toBeVisible();
  await expect(page.getByTestId('connection-status')).toHaveText('Connected ✓');
  await expect(page.getByTestId('ping')).toHaveText(/^\d+ ms$/);
});

test('the server health endpoint answers through the dev proxy', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true });
});

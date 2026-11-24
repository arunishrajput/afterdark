import { expect, type Page, test } from '@playwright/test';

import { createLobby } from './helpers';

/**
 * Field test, 2026-11-24 (UI/UX pass): layout on a narrow phone. A page that is wider than the
 * screen makes Chrome Android zoom the whole layout out, and the sheets then look cut off.
 */
test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

/** The document is never wider than the screen. */
async function expectNoSidewaysScroll(page: Page, where: string) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(
    scroll,
    `${where}: page is ${scroll} px wide on a ${client} px screen`,
  ).toBeLessThanOrEqual(client);
}

test('the lobby, its settings and How to play fit a 360 px phone', async ({ page }) => {
  await createLobby(page, 'Human');
  await expect(page.getByTestId('setup-wizard')).toBeVisible();
  await expectNoSidewaysScroll(page, 'lobby');

  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByTestId('settings-save')).toBeVisible();
  await expectNoSidewaysScroll(page, 'settings');
  // Every stepper's + button is on screen.
  for (const plus of await page.getByRole('button', { name: /^Increase / }).all()) {
    const box = await plus.boundingBox();
    expect(box && box.x + box.width).toBeLessThanOrEqual(360);
  }
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'How to play' }).last().click();
  await expect(page.getByTestId('how-to-card')).toHaveCount(5);
  await expectNoSidewaysScroll(page, 'how to play');
  const card = await page.getByTestId('how-to-card').first().boundingBox();
  expect(card && card.x + card.width).toBeLessThanOrEqual(360);
  await page.screenshot({ path: 'test-results/layout/how-to-play-360.png' });
});

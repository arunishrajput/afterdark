import { expect, type Page, test } from '@playwright/test';

import { createLobby, toPlaying } from './helpers';

/**
 * Field test, 2026-11-24 (UI/UX pass): layout on a narrow phone. A page that is wider than the
 * screen makes Chrome Android zoom the whole layout out, and the sheets then look cut off.
 */
test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
test.describe.configure({ timeout: 120_000 });

const SHOT = 'test-results/layout';

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
  await page.screenshot({ path: `${SHOT}/how-to-play-360.png` });
});

test.describe('in game', () => {
  // The drawing helper clicks with a mouse and needs room for its ~195 m circle: the 390 px phone
  // every other game spec uses, without touch emulation.
  test.use({ viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: false });

  test('the game map fills the screen; the sheet collapses to one card and back', async ({
    page,
  }) => {
    await toPlaying(page);
    const map = await page.getByTestId('map').boundingBox();
    expect(map).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
    await expectNoSidewaysScroll(page, 'game');
    // The map buttons and the attribution sit above the sheet, not under it.
    const sheet = await page.getByTestId('game-sheet').boundingBox();
    const fit = await page.getByTestId('map-fit').boundingBox();
    const attribution = await page.locator('.leaflet-control-attribution').boundingBox();
    expect(sheet && fit && fit.y + fit.height).toBeLessThanOrEqual(sheet?.y ?? 0);
    expect(sheet && attribution && attribution.y + attribution.height).toBeLessThanOrEqual(
      sheet?.y ?? 0,
    );
    await page.waitForTimeout(1500); // tiles, for the screenshot
    await page.screenshot({ path: `${SHOT}/game-expanded.png` });

    await page.getByTestId('sheet-toggle').click();
    await expect(page.getByTestId('game-sheet')).toHaveAttribute('data-expanded', 'false');
    await expect(page.getByTestId('task-card')).toHaveCount(1);
    await expect(page.getByTestId('meeting-button')).toBeVisible();
    const collapsed = await page.getByTestId('game-sheet').boundingBox();
    expect(collapsed && sheet && collapsed.height).toBeLessThan(sheet?.height ?? 0);
    await page.screenshot({ path: `${SHOT}/game-collapsed.png` });

    await page.getByTestId('sheet-toggle').click();
    await expect(page.getByTestId('task-card')).toHaveCount(3);
    await page.getByTestId('map-locate').click();
  });
});

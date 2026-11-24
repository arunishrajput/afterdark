import { expect, type Page, test } from '@playwright/test';

import { createLobby, lobbyWithBots, startAndReveal } from './helpers';

/** Phase 13: How to play, the update banner's queue, the reconnect banner, the sound toggle. */

test('How to play opens from Home with five cards, and from the lobby', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByTestId('how-to-card')).toHaveCount(5);
  await expect(page.getByRole('heading', { name: /Safety first/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/phase13/how-to-play.png' });
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByTestId('how-to-card').first()).toBeHidden();

  await createLobby(page, 'Human');
  await expect(page.getByTestId('how-to-hint')).toBeVisible(); // first run in this browser
  await page.getByTestId('how-to-hint').getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByTestId('how-to-card')).toHaveCount(5);
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByTestId('how-to-hint')).toHaveCount(0); // seen: gone for good
});

test('the install card is quiet on desktop Chromium without an install prompt', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('ios-install-hint')).toHaveCount(0);
});

test('the sound toggle is remembered', async ({ page }) => {
  await createLobby(page, 'Human');
  const toggle = page.getByTestId('sound-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.getByTestId('sound-toggle')).toHaveAttribute('aria-pressed', 'false');
});

async function needRefresh(page: Page) {
  await page.evaluate(() =>
    (
      window as unknown as { __afterdarkActions: { pwaNeedRefresh: () => void } }
    ).__afterdarkActions.pwaNeedRefresh(),
  );
}

test('an update shows on Home, waits in the lobby flow and never shows mid-game', async ({
  page,
}) => {
  await page.goto('/?sim=1');
  await needRefresh(page);
  await expect(page.getByTestId('update-banner')).toBeVisible(); // Home
  await page.screenshot({ path: 'test-results/phase13/update-banner.png' });

  await lobbyWithBots(page, 3); // navigates, so the pretend update is gone
  await needRefresh(page);
  await expect(page.getByTestId('update-banner')).toBeVisible(); // lobby
  await startAndReveal(page);
  await expect(page.getByTestId('update-banner')).toHaveCount(0); // queued during the game
});

test('a dropped connection shows Reconnecting… with a Retry that restores it', async ({ page }) => {
  await createLobby(page, 'Human');
  await page.evaluate(() =>
    (
      window as unknown as { __afterdarkActions: { dropConnection: () => void } }
    ).__afterdarkActions.dropConnection(),
  );
  const banner = page.getByTestId('reconnect-banner');
  await expect(banner).toBeVisible({ timeout: 6000 });
  await expect(banner).toContainText('Reconnecting');
  await page.screenshot({ path: 'test-results/phase13/reconnecting.png' });
  await banner.getByRole('button', { name: 'Retry now' }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.getByTestId('lobby-code')).toBeVisible(); // same lobby, same player
});

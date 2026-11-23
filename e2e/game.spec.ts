import { expect, type Page, test } from '@playwright/test';

import {
  createLobby,
  drawCircle,
  enableTestMode,
  longPress,
  mapPoint,
  newPlayer,
  zoomTo,
} from './helpers';

/**
 * Phase 4: one browser plus bots, through spawn → reveal → play → pause → abort.
 * The server runs with a pinned room salt (playwright.config.ts): as host, the human is
 * crew in a lobby of 8 (human + 7 bots) and an imposter in a lobby of 5 (human + 4 bots).
 */
test.describe.configure({ timeout: 120_000 });

const SHOT = 'test-results/phase04';
const BIG_CIRCLE_DEG = 0.002; // about 195 m, so even 8 spawns fit 40 m apart

async function lobbyWithBots(page: Page, bots: number): Promise<string> {
  const code = await createLobby(page, 'Human');
  await enableTestMode(page);
  // Full screen, so the whole big circle is on screen for the real drawing tool.
  await page.getByTestId('map-expand').click();
  await drawCircle(page, BIG_CIRCLE_DEG);
  await page.getByTestId('map-expand').click();
  await expect(page.getByTestId('boundary-status')).toHaveText(/^Area /);
  await expect(page.getByTestId('location-ok')).toBeVisible();
  // The bot button adds up to 7; for a smaller lobby, add bots one call at a time via the same button.
  const add = page.getByTestId('add-bots');
  await add.click();
  await expect(page.getByTestId('roster-row')).toHaveCount(8);
  if (bots < 7) {
    // Kick the surplus bots (host only), keeping `bots` of them.
    for (let i = 7; i > bots; i--) {
      await page.getByRole('button', { name: `Kick bot-${i}` }).click();
      await page.getByRole('button', { name: `Confirm kicking bot-${i}` }).click();
    }
    await expect(page.getByTestId('roster-row')).toHaveCount(bots + 1);
  }
  return code;
}

async function startAndReveal(page: Page) {
  // Bots ready themselves; then the human readies and the countdown runs.
  await expect(page.getByTestId('ready-button')).toBeEnabled();
  await page.getByTestId('ready-button').click();
  await expect(page.getByTestId('spawn-title')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('spawn-count')).toContainText(/\d+\/\d+ in position/);
  await page.getByTestId('force-start').click();
  await expect(page.getByTestId('reveal-hold')).toBeVisible();
}

test('1 human + 7 bots: spawn → crew reveal → HUD → pause → abort', async ({ browser }) => {
  const page = await newPlayer(browser);
  await lobbyWithBots(page, 7);
  await startAndReveal(page);

  // Neutral while the reveal button is untouched: no role anywhere in the page.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'neutral');
  await expect(page.getByTestId('role-card')).toHaveCount(0);

  // Press and hold: the blue crew card appears, and goes away on release.
  const hold = page.getByTestId('reveal-hold');
  const box = await hold.boundingBox();
  if (!box) throw new Error('no reveal button');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByTestId('role-card')).toBeVisible();
  await expect(page.getByTestId('role-name')).toHaveText('CREW');
  await expect(page.getByTestId('role-tag')).toHaveText(/^[A-Z]+-\d{2}$/);
  await expect(page.getByTestId('role-card')).toHaveAttribute('data-theme', 'crew');
  await page.screenshot({ path: `${SHOT}-crew-reveal.png` });
  await page.mouse.up();
  await expect(page.getByTestId('role-card')).toHaveCount(0);

  // The reveal runs out and the HUD appears in the crew (blue) theme.
  await expect(page.getByTestId('match-timer')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'crew');
  await expect(page.getByTestId('infection-boxes')).toHaveAttribute('aria-label', /of 6 crew/);
  await expect(page.getByTestId('infection-notch')).toHaveCount(1);
  await expect(page.getByTestId('team-score')).toContainText('0 / 100');
  await expect(page.getByTestId('role-chip')).toHaveText('CREW');
  await expect(page.getByTestId('map')).toBeVisible();
  await page.waitForTimeout(2000); // let the map tiles load before the screenshot
  await page.screenshot({ path: `${SHOT}-crew-hud.png` });

  // Walk out of the zone (the simulator's long-press): banner and red edge glow; back in, they clear.
  await expect(page.getByTestId('status-banner')).toBeHidden();
  await zoomTo(page, 16);
  await longPress(page, await mapPoint(page, 0.003, 0));
  await expect(page.getByTestId('status-banner')).toContainText('Return to the zone');
  await expect(page.getByTestId('zone-glow')).toBeVisible();
  await page.screenshot({ path: `${SHOT}-out-of-bounds.png` });
  await longPress(page, await mapPoint(page, 0, 0));
  await expect(page.getByTestId('status-banner')).toBeHidden();
  await expect(page.getByTestId('zone-glow')).toHaveCount(0);

  // Pause freezes the timer; resume restarts it.
  await page.getByTestId('game-menu').click();
  await page.getByTestId('pause-game').click();
  await expect(page.getByTestId('paused-label')).toBeVisible();
  const frozen = await page.getByTestId('match-timer').textContent();
  await page.waitForTimeout(2200);
  expect(await page.getByTestId('match-timer').textContent()).toBe(frozen);
  await page.screenshot({ path: `${SHOT}-paused.png` });
  await page.getByTestId('game-menu').click();
  await page.getByTestId('resume-game').click();
  await expect(page.getByTestId('paused-label')).toBeHidden();
  await expect
    .poll(async () => page.getByTestId('match-timer').textContent(), { timeout: 5000 })
    .not.toBe(frozen);

  // Abort ends the game with no winner.
  await page.getByTestId('game-menu').click();
  await page.getByTestId('abort-game').click();
  await page.getByTestId('abort-confirm').click();
  await expect(page.getByTestId('ended-title')).toHaveText('Game ended');
  await expect(page.getByTestId('ended-reason')).toHaveText('The host ended the game.');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'neutral');
  await page.context().close();
});

test('imposter reveal: red card with class and allies, red HUD', async ({ browser }) => {
  const page = await newPlayer(browser);
  await lobbyWithBots(page, 4); // 5 players → 1 imposter; the pinned salt makes it the human
  await startAndReveal(page);

  const box = await page.getByTestId('reveal-hold').boundingBox();
  if (!box) throw new Error('no reveal button');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByTestId('role-name')).toHaveText('IMPOSTER');
  await expect(page.getByTestId('role-card')).toHaveAttribute('data-theme', 'imposter');
  await expect(page.getByTestId('class-card')).toHaveCount(1);
  await expect(page.getByText('You work alone')).toBeVisible(); // 1 imposter: no allies
  await page.screenshot({ path: `${SHOT}-imposter-reveal.png` });
  await page.mouse.up();

  await expect(page.getByTestId('match-timer')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'imposter');
  await expect(page.getByTestId('role-chip')).toContainText('IMPOSTER');
  await page.screenshot({ path: `${SHOT}-imposter-hud.png` });
  await page.context().close();
});

test('spawn screen: your pin, the distance and the x/y counter', async ({ browser }) => {
  const page = await newPlayer(browser);
  await lobbyWithBots(page, 7);
  await expect(page.getByTestId('ready-button')).toBeEnabled();
  await page.getByTestId('ready-button').click();
  await expect(page.getByTestId('spawn-title')).toBeVisible({ timeout: 15_000 });
  // Either the distance to the pin, or "in position" when the simulated player already stands on it.
  await expect(
    page.getByTestId('spawn-distance').or(page.getByTestId('spawn-reached')),
  ).toBeVisible();
  await expect(page.getByTestId('spawn-count')).toHaveText(/^\d\/8 in position$/);
  await expect(page.getByTestId('force-start')).toBeVisible();
  await expect(page.locator('.spawn-pin')).toBeVisible();
  await page.screenshot({ path: `${SHOT}-spawn.png` });
  await page.context().close();
});

import { expect, test } from '@playwright/test';

import { finishFirstTask, lobbyWithBots, newPlayer, setConfig, startAndReveal } from './helpers';

/**
 * Phase 12: one human (crew, in the GPS simulator) plus 7 bots play to a crew win by tasks alone.
 * The results screen shows the banner, who was who, the chart, the leaderboard, the timeline and the
 * meetings; the host taps Play again and lands in the lobby with the same area and everyone's name
 * on the roster, nobody ready.
 */
test.describe.configure({ timeout: 300_000 });

const SHOT = 'test-results/phase12';
const WIN_WAIT_MS = 240_000;
const MAX_ROUNDS = 12;

test('a crew win shows the results, then Play again returns to the same lobby', async ({
  browser,
}) => {
  const page = await newPlayer(browser);
  await lobbyWithBots(page, 7);
  const boundary = await page.getByTestId('boundary-status').textContent();
  // The lowest target the settings allow, so the bots' tasks end it within a couple of minutes.
  await setConfig(page, { coopChance: 0, targetScore: 40 });
  await startAndReveal(page);
  await expect(page.getByTestId('task-card')).toHaveCount(3, { timeout: 20_000 });

  // The player works their own cards (the test-mode shortcut solves each opened task) while the bots work theirs.
  const results = page.getByTestId('results-screen');
  for (let round = 0; round < MAX_ROUNDS && (await results.count()) === 0; round++) {
    try {
      await finishFirstTask(page, SHOT);
    } catch (error) {
      // The last bot task can end the game under us: that is the screen this test wants.
      if ((await results.count()) === 0 && round === MAX_ROUNDS - 1) throw error;
    }
  }
  await expect(results).toBeVisible({ timeout: WIN_WAIT_MS });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'neutral');
  await expect(page.getByTestId('ended-title')).toHaveText('Crew wins');
  await expect(page.getByTestId('ended-reason')).toHaveText('The crew reached the target score.');
  await expect(page.getByTestId('winner-banner')).toHaveAttribute('data-tone', 'crew');

  // Who was who: 8 cards, 2 imposters (8 players), and every card names a tag.
  await expect(page.getByTestId('who-card')).toHaveCount(8);
  await expect(page.locator('[data-testid="who-card"][data-role="imposter"]')).toHaveCount(2);
  // The leaderboard has everyone and the crew MVP award; the chart and the timeline are drawn.
  await expect(page.getByTestId('leaderboard-row')).toHaveCount(8);
  await expect(page.getByTestId('award-mvp')).toBeVisible();
  await expect(page.getByTestId('score-chart')).toBeVisible();
  await expect(page.getByTestId('meeting-history')).toHaveCount(0); // none were held: the empty line shows
  await expect(page.getByText('No meetings were held.')).toBeVisible();
  await page.waitForTimeout(1500); // the cards finish flipping
  await page.screenshot({ path: `${SHOT}-results.png`, fullPage: true });

  // The host (this player) can play again.
  await expect(page.getByTestId('results-waiting')).toHaveCount(0);
  await page.getByTestId('results-play-again').click();
  await expect(page.getByTestId('ready-button')).toBeVisible();
  await expect(page.getByTestId('results-screen')).toHaveCount(0);
  await expect(page.getByTestId('boundary-status')).toHaveText(boundary ?? /^Area /);
  await expect(page.getByTestId('roster-row')).toHaveCount(8);
  await page.screenshot({ path: `${SHOT}-lobby-again.png` });
  await page.context().close();
});

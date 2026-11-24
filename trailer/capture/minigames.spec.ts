import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { lobbyWithBots, reachPin, setMinigames, startAndReveal, startTask } from '../../e2e/helpers';

const OUT = join(import.meta.dirname, '..', 'public', 'footage');
mkdirSync(OUT, { recursive: true });
const TYPES = ['wires', 'lock', 'pattern', 'signal', 'slide', 'crossword', 'keyfetch'];

for (const type of TYPES) {
  test(`minigame ${type}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await lobbyWithBots(page, 7);
    await setMinigames(page, [type]);
    await startAndReveal(page);
    await expect(page.getByTestId('match-timer')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('task-card')).toHaveCount(3);
    await reachPin(page, join(OUT, '_tmp'));
    await startTask(page);
    await expect(page.getByTestId('task-player')).toBeVisible();
    await page.waitForTimeout(2200);
    await page.screenshot({ path: join(OUT, `mg-${type}.png`) });
    await ctx.close();
    await new Promise((r) => setTimeout(r, 14_000)); // lobby-create rate limit
  });
}

import { expect, test } from '@playwright/test';

import { newPlayer, reachPin as reach, startTask, toPlaying } from './helpers';

/**
 * Phase 5: one browser (a crew player in the GPS simulator) plus 7 bots. The player is sent to a
 * section, sees the pin appear, hops to the pin and plays the minigame through the real UI.
 * The server runs with a pinned room salt (playwright.config.ts): the host of 8 is crew.
 */
test.describe.configure({ timeout: 150_000 });

const SHOT = 'test-results/phase05';
const WRONG_ATTEMPT_PAUSE_MS = 3500; // the 3 s lockout after a wrong answer, plus a margin

test('wires: section → pin → solve through the UI → the score goes up', async ({ browser }) => {
  const page = await newPlayer(browser);
  await toPlaying(page, { minigames: ['wires'] });
  await expect(page.getByTestId('personal-score')).toHaveText(/You\s*0/);
  const before = await page.getByTestId('task-card').first().getAttribute('data-stage');
  expect(before).toBe('assigned');

  await reach(page, SHOT);
  await startTask(page);
  await expect(page.getByTestId('minigame-wires')).toBeVisible();
  await expect(page.getByTestId('task-points')).toHaveText('+4');

  // The wires are named "Left red circle" / "Right red circle": match them by name.
  const names = async (side: 'left' | 'right') => {
    const n = await page.locator(`[data-testid^="wire-${side}-"]`).count();
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const label = (await page.getByTestId(`wire-${side}-${i}`).getAttribute('aria-label')) ?? '';
      out.push(label.replace(/^(Left|Right) /, '').replace(/, connected$/, ''));
    }
    return out;
  };
  const left = await names('left');
  const right = await names('right');
  expect(left).toHaveLength(4);

  // A wrong attempt first: every wire shifted by one place. The server says no.
  for (let i = 0; i < left.length; i++) {
    await page.getByTestId(`wire-left-${i}`).click();
    await page
      .getByTestId(`wire-right-${(right.indexOf(left[i] as string) + 1) % left.length}`)
      .click();
  }
  await page.screenshot({ path: `${SHOT}-wires-wrong.png` });
  await page.getByTestId('wires-submit').click();
  await expect(page.getByTestId('task-feedback')).toContainText('Not quite');
  await expect(page.getByTestId('team-score')).toContainText('0 / 100');

  // Wait out the lockout, undo the wrong connections and connect each wire to its match.
  await page.waitForTimeout(WRONG_ATTEMPT_PAUSE_MS);
  for (let i = 0; i < left.length; i++) await page.getByTestId(`wire-left-${i}`).click(); // unlink
  for (let i = 0; i < left.length; i++) {
    await page.getByTestId(`wire-left-${i}`).click();
    await page.getByTestId(`wire-right-${right.indexOf(left[i] as string)}`).click();
  }
  await page.screenshot({ path: `${SHOT}-wires-solved.png` });
  await page.getByTestId('wires-submit').click();

  await expect(page.getByTestId('task-done')).toContainText('+4');
  await page.screenshot({ path: `${SHOT}-wires-done.png` });
  // Back on the map: the personal score rose, the team bar moved, and the slot refilled.
  await expect(page.getByTestId('task-player')).toHaveCount(0, { timeout: 5000 });
  await expect(page.getByTestId('personal-score')).toHaveText(/You\s*4/);
  await expect(page.getByTestId('team-score')).not.toContainText(/^0 \/ 100/);
  await expect(page.getByTestId('task-card')).toHaveCount(3);
  await expect(page.getByTestId('task-card').first()).toHaveAttribute('data-stage', 'assigned');
  await page.context().close();
});

/** Mastermind score of `guess` against `code` (the server's own rule). */
function score(code: number[], guess: number[]) {
  let exact = 0;
  const c = new Map<number, number>();
  const g = new Map<number, number>();
  code.forEach((d, i) => {
    if (guess[i] === d) exact++;
    else {
      c.set(d, (c.get(d) ?? 0) + 1);
      g.set(guess[i] as number, (g.get(guess[i] as number) ?? 0) + 1);
    }
  });
  let misplaced = 0;
  for (const [d, n] of g) misplaced += Math.min(n, c.get(d) ?? 0);
  return { exact, misplaced };
}

test('lock: the guess flow reads the feedback and solves the code', async ({ browser }) => {
  const page = await newPlayer(browser);
  await toPlaying(page, { minigames: ['lock'] });
  await reach(page, SHOT);
  await startTask(page);
  await expect(page.getByTestId('minigame-lock')).toBeVisible();
  await expect(page.getByTestId('task-points')).toHaveText('+5');

  // Candidates 000–555; each round try the first one that is still consistent with the feedback.
  let candidates: number[][] = [];
  for (let n = 0; n < 6 ** 3; n++)
    candidates.push([Math.floor(n / 36) % 6, Math.floor(n / 6) % 6, n % 6]);
  const current = [0, 0, 0];
  let guesses = 0;
  for (; guesses < 8; guesses++) {
    const guess = candidates[0] as number[];
    for (let i = 0; i < 3; i++) {
      // Step each digit to its target with the ▲ button (wrapping 5 → 0).
      while (current[i] !== guess[i]) {
        await page.getByTestId(`lock-up-${i}`).click();
        current[i] = ((current[i] as number) + 1) % 6;
      }
    }
    await page.getByTestId('lock-try').click();
    if (guesses === 0) await page.screenshot({ path: `${SHOT}-lock-feedback.png` });
    // Either this guess's row appears, or the code was right and the task closes.
    const rows = page.getByTestId('lock-history').locator('li');
    await expect
      .poll(
        async () =>
          (await page.getByTestId('task-done').count()) > 0 || (await rows.count()) === guesses + 1,
        {
          timeout: 8000,
        },
      )
      .toBe(true);
    if ((await page.getByTestId('task-done').count()) > 0) break;
    // Read the newest feedback row, e.g. "1 right place · 2 wrong place".
    const row = page.getByTestId('lock-history').locator('li').first();
    const [, exact, misplaced] =
      /(\d+) right place · (\d+) wrong place/.exec((await row.textContent()) ?? '') ?? [];
    if (exact === undefined || misplaced === undefined) throw new Error('no feedback to read');
    candidates = candidates.filter((c) => {
      const s = score(c, guess);
      return s.exact === Number(exact) && s.misplaced === Number(misplaced);
    });
    if (Number(exact) === 3) break;
  }
  await expect(page.getByTestId('task-done')).toContainText('+5', { timeout: 10_000 });
  expect(guesses).toBeLessThan(8);
  await page.screenshot({ path: `${SHOT}-lock-done.png` });
  await expect(page.getByTestId('task-player')).toHaveCount(0, { timeout: 5000 });
  await expect(page.getByTestId('personal-score')).toHaveText(/You\s*5/);
  await page.context().close();
});

test('reroll swaps a task and then shows its cooldown', async ({ browser }) => {
  const page = await newPlayer(browser);
  await toPlaying(page, { minigames: ['wires'] });
  const idOf = async () =>
    (await page.getByTestId('task-card').first().getByTestId('task-label').textContent()) ?? '';
  const before = await page.locator('[data-testid="task-card"]').count();
  expect(before).toBe(3);
  await page.getByTestId('task-menu').first().click();
  await expect(page.getByTestId('task-reroll')).toBeEnabled();
  await page.screenshot({ path: `${SHOT}-card-menu.png` });
  await page.getByTestId('task-reroll').click();
  // The sheet closes, three cards remain, and the next reroll is on cooldown.
  await expect(page.getByTestId('task-card')).toHaveCount(3);
  await page.getByTestId('task-menu').first().click();
  await expect(page.getByTestId('task-reroll')).toBeDisabled();
  await expect(page.getByTestId('task-reroll')).toContainText(/Reroll ready in 0[23]:\d\d/);
  expect(await idOf()).not.toBe('');
  await page.context().close();
});

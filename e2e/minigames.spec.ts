import { expect, type Page, test } from '@playwright/test';

import { entriesOf, transpose } from '../packages/shared/src/minigames/crossword';
import { CLUES, CROSSWORD_GRIDS } from '../packages/shared/src/minigames/data/crosswords';
import { SIGNAL_WORDS } from '../packages/shared/src/minigames/data/signalWords';
import { newPlayer, reachPin, startTask, toPlaying } from './helpers';

/**
 * Phase 11: each new minigame is played through the real UI (a crew player in the GPS simulator
 * plus 7 bots), at phone width, and the server accepts the answer. The answers are worked out from
 * what the screen shows, the way a player would; the solvers live here, in test code only.
 */
test.describe.configure({ timeout: 150_000 });

const SHOT = 'test-results/phase11';
const PHONE = { width: 375, height: 812 };

async function setup(page: Page, game: string, shotName: string) {
  await toPlaying(page, { minigames: [game] });
  await reachPin(page, `${SHOT}-${shotName}`);
  await page.setViewportSize(PHONE);
  await startTask(page);
}

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** Every interactive control in the minigame is at least 44 px tall (UI_UX §2). */
async function tapTargetsOk(page: Page, scope: string) {
  const small = await page.evaluate((s) => {
    const root = document.querySelector(`[data-testid="${s}"]`);
    return [...(root?.querySelectorAll('button') ?? [])]
      .map((b) => b.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.height < 44 || r.width < 30))
      .map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`);
  }, scope);
  expect(small, 'targets under 44 px').toEqual([]);
}

test('slide: solve the board with taps, the server replays the moves', async ({ browser }) => {
  const page = await newPlayer(browser);
  await setup(page, 'slide', 'slide');
  await expect(page.getByTestId('minigame-slide')).toBeVisible();
  await expect(page.getByTestId('task-points')).toHaveText('+7');
  expect(await noHorizontalScroll(page)).toBe(true);
  await tapTargetsOk(page, 'minigame-slide');
  await page.screenshot({ path: `${SHOT}-slide.png` });

  const board = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-label="Sliding puzzle board"] > *')].map((el) => {
      const id = el.getAttribute('data-testid') ?? '';
      return id === 'slide-gap' ? 0 : Number(id.replace('slide-tile-', ''));
    }),
  );
  expect(board.slice().sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const moves = solveSlide(board);
  for (const tile of moves) await page.getByTestId(`slide-tile-${tile}`).click();
  await expect(page.getByTestId('slide-submit')).toBeEnabled();
  await page.screenshot({ path: `${SHOT}-slide-solved.png` });
  await page.getByTestId('slide-submit').click();
  await expect(page.getByTestId('task-done')).toContainText('+7');
  await expect(page.getByTestId('personal-score')).toHaveText(/You\s*7/, { timeout: 8000 });
  await page.context().close();
});

/** Breadth-first search over 3×3 boards. */
function solveSlide(start: number[]): number[] {
  const goal = '123456780';
  const seen = new Map<string, { from: string; tile: number } | null>([[start.join(''), null]]);
  let frontier = [start];
  while (frontier.length) {
    const next: number[][] = [];
    for (const b of frontier) {
      const key = b.join('');
      if (key === goal) {
        const out: number[] = [];
        for (let s = seen.get(key); s; s = seen.get(s.from)) out.push(s.tile);
        return out.reverse();
      }
      const gap = b.indexOf(0);
      for (const d of [-3, 3, -1, 1]) {
        const at = gap + d;
        if (at < 0 || at > 8 || (Math.abs(d) === 1 && Math.floor(at / 3) !== Math.floor(gap / 3)))
          continue;
        const m = [...b];
        m[gap] = b[at] as number;
        m[at] = 0;
        const k = m.join('');
        if (seen.has(k)) continue;
        seen.set(k, { from: key, tile: b[at] as number });
        next.push(m);
      }
    }
    frontier = next;
  }
  throw new Error('unsolvable board');
}

test('pattern: watch the flashes, repeat them, a wrong replay is refused first', async ({
  browser,
}) => {
  const page = await newPlayer(browser);
  await setup(page, 'pattern', 'pattern');
  await expect(page.getByTestId('minigame-pattern')).toBeVisible();
  await expect(page.getByTestId('task-points')).toHaveText('+5');
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.screenshot({ path: `${SHOT}-pattern-watch.png` });
  await expect(page.getByTestId('pattern-status')).toContainText('Repeat it', { timeout: 15_000 });
  await tapTargetsOk(page, 'minigame-pattern');

  // Record a second playback: the cells that light up, in order.
  const recorded = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const seq: number[] = [];
        const pad = document.querySelector('[aria-label="Pattern pad"]');
        const status = document.querySelector('[data-testid="pattern-status"]');
        const done = () => {
          if (status?.textContent?.includes('Repeat it')) {
            obs.disconnect();
            resolve(seq);
          }
        };
        const obs = new MutationObserver((records) => {
          for (const r of records) {
            if (r.type !== 'attributes') continue;
            const el = r.target as HTMLElement;
            if (el.dataset.lit === 'true') {
              const cell = Number(el.dataset.testid?.replace('pattern-cell-', ''));
              seq.push(cell);
            }
          }
          done();
        });
        if (pad)
          obs.observe(pad, { attributes: true, attributeFilter: ['data-lit'], subtree: true });
        if (status) obs.observe(status, { childList: true, characterData: true, subtree: true });
      }),
  );
  await page.getByTestId('pattern-replay').click();
  const seq = await recorded;
  expect(seq).toHaveLength(5);

  // Wrong first: the same cell five times.
  const wrongCell = seq[0] === 0 ? 1 : 0;
  for (let i = 0; i < 5; i++) await page.getByTestId(`pattern-cell-${wrongCell}`).click();
  await expect(page.getByTestId('task-feedback')).toContainText('Not quite');
  await page.waitForTimeout(3500);
  for (const cell of seq) await page.getByTestId(`pattern-cell-${cell}`).click();
  await expect(page.getByTestId('task-done')).toContainText('+5');
  await page.context().close();
});

test('signal: decode the word from the symbols and the partial key', async ({ browser }) => {
  const page = await newPlayer(browser);
  await setup(page, 'signal', 'signal');
  await expect(page.getByTestId('minigame-signal')).toBeVisible();
  await expect(page.getByTestId('task-points')).toHaveText('+6');
  expect(await noHorizontalScroll(page)).toBe(true);
  await tapTargetsOk(page, 'minigame-signal');
  await page.screenshot({ path: `${SHOT}-signal.png` });

  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="signal-sym-"]')].map(
      (b) => b.getAttribute('aria-label') ?? '',
    ),
  );
  // "Symbol 2, star, letter A, given" or "Symbol 3, moon, not decoded"
  const cells = labels.map((l) => {
    const m = /^Symbol \d+, (\w+), (?:letter ([A-Z])|not decoded)/.exec(l);
    if (!m) throw new Error(`unreadable label ${l}`);
    return { name: m[1] as string, letter: m[2] };
  });
  const fits = SIGNAL_WORDS.filter((w) => {
    if (w.length !== cells.length) return false;
    const byName = new Map<string, string>();
    const byLetter = new Map<string, string>();
    return cells.every((c, i) => {
      const ch = w[i] as string;
      if ((byName.get(c.name) ?? ch) !== ch || (byLetter.get(ch) ?? c.name) !== c.name)
        return false;
      byName.set(c.name, ch);
      byLetter.set(ch, c.name);
      return c.letter === undefined || c.letter === ch;
    });
  });
  expect(fits).toHaveLength(1);
  const word = fits[0] as string;
  // A wrong word first, then the right one.
  const typeWord = async (w: string) => {
    for (let i = 0; i < cells.length; i++) {
      if (cells[i]?.letter !== undefined) continue;
      await page.getByTestId(`signal-sym-${i}`).click();
      await page.getByTestId(`key-${w[i]}`).click();
    }
  };
  const wrong = [...word].map((ch, i) => (cells[i]?.letter === undefined ? 'Q' : ch)).join('');
  if (wrong !== word) {
    await typeWord(wrong);
    await page.getByTestId('signal-submit').click();
    await expect(page.getByTestId('task-feedback')).toContainText('Not quite');
    await page.waitForTimeout(3500);
  }
  await typeWord(word);
  await page.screenshot({ path: `${SHOT}-signal-filled.png` });
  await page.getByTestId('signal-submit').click();
  await expect(page.getByTestId('task-done')).toContainText('+6');
  await page.context().close();
});

test('crossword: fill the grid with the on-screen keypad, case-insensitive on the server', async ({
  browser,
}) => {
  const page = await newPlayer(browser);
  await setup(page, 'crossword', 'crossword');
  await expect(page.getByTestId('minigame-crossword')).toBeVisible();
  await expect(page.getByTestId('task-points')).toHaveText('+8');
  expect(await noHorizontalScroll(page)).toBe(true);
  await tapTargetsOk(page, 'minigame-crossword');
  await page.screenshot({ path: `${SHOT}-crossword.png` });

  // The system keyboard never opens: there is no text input on the sheet.
  await expect(page.locator('[data-testid="minigame-crossword"] input')).toHaveCount(0);

  // Which grid is this? The one (or its transpose) whose clues are the ones on screen.
  const shown = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="minigame-crossword"] ul li')].map(
      (li) => li.textContent?.replace(/^\d+ (Across|Down):\s*/, '').trim() ?? '',
    ),
  );
  const candidates = CROSSWORD_GRIDS.flatMap((g) => [[...g], transpose(g)]);
  const grid = candidates.find((g) => {
    const { across, down } = entriesOf(g);
    const clues = [...across, ...down].map((e) => CLUES[e.word]);
    return clues.length === shown.length && clues.every((c) => shown.includes(c as string));
  });
  if (!grid) throw new Error('grid not found in the bank');
  const size = grid.length;
  await page.screenshot({ path: `${SHOT}-crossword-empty.png` });
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const ch = grid[r]?.[c];
      if (!ch || ch === '#') continue;
      await page.getByTestId(`xw-${r}-${c}`).click();
      await page.getByTestId(`key-${ch}`).click();
    }
  }
  await expect(page.getByTestId('crossword-submit')).toBeEnabled();
  await page.screenshot({ path: `${SHOT}-crossword-filled.png` });
  await page.getByTestId('crossword-submit').click();
  await expect(page.getByTestId('task-done')).toContainText('+8');
  await page.context().close();
});

test('keyfetch: hold to pick up the key, the card moves to Point 2, turn the key there', async ({
  browser,
}) => {
  const page = await newPlayer(browser);
  await setup(page, 'keyfetch', 'keyfetch');
  await expect(page.getByTestId('minigame-keyfetch')).toHaveAttribute('data-leg', '1');
  await expect(page.getByTestId('task-points')).toHaveText('+12');
  expect(await noHorizontalScroll(page)).toBe(true);
  await tapTargetsOk(page, 'minigame-keyfetch');
  await page.screenshot({ path: `${SHOT}-keyfetch-leg1.png` });

  // Letting go early starts again: hold 1 s, release, then hold the whole time.
  const button = page.getByTestId('key-pickup');
  const box = await button.boundingBox();
  if (!box) throw new Error('no key button');
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOT}-keyfetch-holding.png` });
  await page.mouse.up();
  await expect(page.getByTestId('key-picked')).toHaveCount(0);
  await page.mouse.down();
  await expect(page.getByTestId('key-picked')).toBeVisible({ timeout: 8000 });
  await page.mouse.up();
  await page.screenshot({ path: `${SHOT}-keyfetch-picked.png` });
  await expect(page.getByTestId('task-player')).toHaveCount(0, { timeout: 5000 });

  // The same card is now at Stage 1 for Point 2, and says the key is in hand.
  const card = page.getByTestId('task-card').first();
  await expect(card).toHaveAttribute('data-holds-key', 'true');
  await expect(card).toHaveAttribute('data-stage', 'assigned');
  await expect(card).toContainText('Key in hand');
  await page.screenshot({ path: `${SHOT}-keyfetch-card.png` });

  await reachPin(page, `${SHOT}-keyfetch-leg2`);
  await startTask(page);
  await expect(page.getByTestId('minigame-keyfetch')).toHaveAttribute('data-leg', '2');
  const turns = await page
    .getByTestId('key-sequence')
    .locator('li')
    .evaluateAll((els) => els.map((e) => (e.textContent?.includes('Left') ? 'L' : 'R')));
  expect(turns).toHaveLength(3);
  await page.screenshot({ path: `${SHOT}-keyfetch-leg2-screen.png` });
  const wrong = turns.map((t) => (t === 'L' ? 'R' : 'L'));
  for (const t of wrong) await page.getByTestId(`key-turn-${t}`).click();
  await expect(page.getByTestId('task-feedback')).toContainText('Not quite');
  await page.waitForTimeout(3500);
  for (const t of turns) await page.getByTestId(`key-turn-${t}`).click();
  await expect(page.getByTestId('task-done')).toContainText('+12');
  await expect(page.getByTestId('personal-score')).toHaveText(/You\s*12/, { timeout: 8000 });
  await page.context().close();
});

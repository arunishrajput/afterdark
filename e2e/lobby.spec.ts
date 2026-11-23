import { type Browser, expect, type Page, test } from '@playwright/test';

/** One isolated browser context per player (separate localStorage = separate device). */
async function newPlayer(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  return ctx.newPage();
}

async function fillEntry(page: Page, name: string, submit: string) {
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: submit }).click();
}

async function createLobby(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create game' }).click();
  await fillEntry(page, name, 'Create lobby');
  const code = (await page.getByTestId('lobby-code').textContent()) ?? '';
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  return code;
}

async function joinLobby(page: Page, code: string, name: string) {
  await page.goto(`/?code=${code}`);
  await expect(page.getByLabel('Lobby code')).toHaveValue(code); // ?code= pre-fills Join
  await page.getByRole('button', { name: 'Join game' }).click();
  await fillEntry(page, name, 'Join lobby');
  await expect(page.getByTestId('lobby-code')).toHaveText(code);
}

test('players create, join by code, ready up and see the countdown; reload keeps the player', async ({
  browser,
}) => {
  // The countdown needs minPlayers (4) all ready, so this uses 4 contexts.
  const names = ['Ann', 'Bea', 'Cy', 'Di'];
  const pages = await Promise.all(names.map(() => newPlayer(browser)));
  const [host, ...guests] = pages as [Page, ...Page[]];

  const code = await createLobby(host, 'Ann');
  for (const [i, page] of guests.entries()) await joinLobby(page, code, names[i + 1] ?? '');

  for (const page of pages) await expect(page.getByTestId('roster-row')).toHaveCount(4);
  await expect(host.getByTestId('roster-row').first()).toContainText('Ann');

  for (const page of pages) await page.getByTestId('ready-button').click();
  for (const page of pages) await expect(page.getByTestId('countdown')).toBeVisible();

  // Reload a guest mid-countdown: the same player comes back (un-readied by the drop).
  const bea = guests[0] as Page;
  await bea.reload();
  await expect(bea.getByTestId('lobby-code')).toHaveText(code);
  await expect(bea.getByTestId('roster-row')).toHaveCount(4);
  await expect(bea.getByTestId('roster-row').filter({ hasText: 'Bea' })).toContainText('you');
  await expect(host.getByTestId('countdown')).toBeHidden();

  // Ready again → countdown → placeholder "starting" screen.
  await bea.getByTestId('ready-button').click();
  for (const page of pages)
    await expect(page.getByTestId('starting')).toBeVisible({ timeout: 10_000 });

  for (const page of pages) await page.context().close();
});

test('a second tab for the same session replaces the first', async ({ browser }) => {
  const first = await newPlayer(browser);
  const code = await createLobby(first, 'Solo');
  const second = await first.context().newPage(); // same context = same saved session
  await second.goto('/');
  await expect(second.getByTestId('lobby-code')).toHaveText(code);
  await expect(first.getByTestId('notice')).toHaveText('Open in another tab');
  await first.getByRole('button', { name: 'Use here instead' }).click();
  await expect(first.getByTestId('lobby-code')).toHaveText(code);
  await expect(second.getByTestId('notice')).toHaveText('Open in another tab');
  await first.context().close();
});

test('the host can kick a player, who sees a notice and cannot get back in', async ({
  browser,
}) => {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);
  const code = await createLobby(host, 'Boss');
  await joinLobby(guest, code, 'Mallory');

  await host.getByRole('button', { name: 'Kick Mallory' }).click();
  await host.getByRole('button', { name: 'Confirm kicking Mallory' }).click();
  await expect(guest.getByTestId('notice')).toHaveText('You were removed');
  await expect(host.getByTestId('roster-row')).toHaveCount(1);

  // The kicked device's saved session is gone: a reload lands on Home.
  await guest.reload();
  await expect(guest.getByRole('button', { name: 'Create game' })).toBeVisible();

  await host.context().close();
  await guest.context().close();
});

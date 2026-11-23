import { expect, type Page, test } from '@playwright/test';

import { createLobby, drawCircle, enableTestMode, joinLobby, newPlayer } from './helpers';

test('players create, join by code, ready up and see the countdown; reload keeps the player', async ({
  browser,
}) => {
  // The countdown needs minPlayers (4) all ready, so this uses 4 contexts.
  const names = ['Ann', 'Bea', 'Cy', 'Di'];
  const pages = await Promise.all(names.map(() => newPlayer(browser)));
  const [host, ...guests] = pages as [Page, ...Page[]];

  const code = await createLobby(host, 'Ann');
  await enableTestMode(host); // simulated GPS for everyone, so each phone has a good fix
  for (const [i, page] of guests.entries()) await joinLobby(page, code, names[i + 1] ?? '');

  for (const page of pages) await expect(page.getByTestId('roster-row')).toHaveCount(4);
  await expect(host.getByTestId('roster-row').first()).toContainText('Ann');

  await drawCircle(host); // the countdown also needs a boundary
  for (const page of pages) await expect(page.getByTestId('boundary-status')).toHaveText(/^Area /);
  for (const page of pages) await expect(page.getByTestId('location-ok')).toBeVisible();

  for (const page of pages) await page.getByTestId('ready-button').click();
  for (const page of pages) await expect(page.getByTestId('countdown')).toBeVisible();

  // Reload a guest mid-countdown: the same player comes back (un-readied by the drop).
  const bea = guests[0] as Page;
  await bea.reload();
  await expect(bea.getByTestId('lobby-code')).toHaveText(code);
  await expect(bea.getByTestId('roster-row')).toHaveCount(4);
  await expect(bea.getByTestId('roster-row').filter({ hasText: 'Bea' })).toContainText('you');
  await expect(host.getByTestId('countdown')).toBeHidden();

  // Ready again → countdown → everyone walks to their spawn.
  await bea.getByTestId('ready-button').click();
  for (const page of pages)
    await expect(page.getByTestId('spawn-title')).toBeVisible({ timeout: 10_000 });

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

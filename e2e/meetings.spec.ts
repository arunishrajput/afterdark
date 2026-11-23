import { expect, type Page, test } from '@playwright/test';

import {
  advanceClock,
  enableTestMode,
  joinLobby,
  lobbyWithBots,
  newPlayer,
  simTeleportToBase,
  startAndReveal,
} from './helpers';

/**
 * Phase 8: a human host, two human guests and 3 bots (all in the GPS simulator). A guest calls a
 * meeting; every phone shows the alarm; Gather shows the Base distance and arrivals; Discuss and
 * Vote follow; the result shows tallies and the ejection reveal; and the match timer is exactly where
 * it was before the call (game time stood still the whole time). The meeting screen is the neutral
 * theme for everyone.
 */
test.describe.configure({ timeout: 330_000 });

const SHOT = 'test-results/phase08';
const SECONDS_PER_MIN = 60;

/** `mm:ss` of the match timer as seconds. */
async function timerSeconds(page: Page): Promise<number> {
  const text = (await page.getByTestId('match-timer').textContent()) ?? '0:0';
  const [m = 0, s = 0] = text.split(':').map(Number);
  return m * SECONDS_PER_MIN + s;
}

test('a meeting runs gather → discuss → vote → result, with the match timer standing still', async ({
  browser,
}) => {
  const host = await newPlayer(browser);
  const code = await lobbyWithBots(host, 3);
  await enableTestMode(host, { everyone: true });
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  await joinLobby(a, code, 'Guest A');
  await joinLobby(b, code, 'Guest B');
  for (const page of [a, b]) {
    await expect(page.getByTestId('location-ok')).toBeVisible();
    await page.getByTestId('ready-button').click();
  }
  await startAndReveal(host);
  const players = [host, a, b];
  for (const p of players)
    await expect(p.getByTestId('match-timer')).toBeVisible({ timeout: 20_000 });

  // No meeting in the first 120 s of play: the button explains itself when the server refuses.
  await a.getByTestId('meeting-button').click();
  await expect(a.getByTestId('meeting-confirm-text')).toContainText('You have 1');
  await a.getByTestId('meeting-confirm').click();
  await expect(a.getByText('Too early for a meeting')).toBeVisible();
  await expect(a.getByTestId('meeting-screen')).toHaveCount(0);

  await advanceClock(host, 125);
  const before = await timerSeconds(host);
  await a.getByTestId('meeting-button').click();
  await a.getByTestId('meeting-confirm').click();

  // The alarm, on every phone, with the caller's name; and nobody sees a role colour.
  for (const p of players) {
    await expect(p.getByTestId('meeting-screen')).toBeVisible();
    await expect(p.getByTestId('meeting-alarm')).toContainText('Guest A called a meeting');
    expect(await p.evaluate(() => document.documentElement.dataset.theme)).toBe('neutral');
  }
  await host.screenshot({ path: `${SHOT}-alarm.png` });
  await host.getByTestId('meeting-alarm').click();

  // Gather: the Base distance first; arriving flips it to "at the Base" and counts the arrival.
  await expect(host.getByTestId('meeting-stage')).toHaveText('Go to the Base');
  await expect(host.getByTestId('base-distance')).toBeVisible();
  await host.screenshot({ path: `${SHOT}-gather.png` });
  for (const p of players) await simTeleportToBase(p);
  // The bots may already be at the Base (then Discuss is up at once), so the arrival check is only made while Gather lasts.
  const stage = host.getByTestId('meeting-stage');
  await expect(stage).toHaveText(/Go to the Base|Discuss/);
  if ((await stage.textContent()) === 'Go to the Base') {
    await expect(host.getByTestId('arrivals')).toContainText('at the Base');
    await host.screenshot({ path: `${SHOT}-gather-arrived.png` });
  }

  // Discuss starts when everyone is at the Base (the bots walk there) or after 180 s.
  await expect(host.getByTestId('meeting-stage')).toHaveText('Discuss', { timeout: 200_000 });
  await expect(host.getByTestId('roster-card')).toHaveCount(6);
  await host.screenshot({ path: `${SHOT}-discuss.png` });
  for (const p of players) await p.getByTestId('skip-to-vote').click();

  // Vote: the host picks Guest B and confirms; the vote is locked and cannot be changed.
  await expect(host.getByTestId('meeting-stage')).toHaveText('Vote');
  await host.getByTestId('vote-card').filter({ hasText: 'Guest B' }).click();
  await host.screenshot({ path: `${SHOT}-vote.png` });
  await host.getByTestId('vote-confirm').click();
  await expect(host.getByTestId('vote-locked')).toContainText('Guest B');
  await expect(host.getByTestId('vote-card').first()).toBeDisabled();
  await a.getByTestId('vote-skip').click();
  await a.getByTestId('vote-confirm').click();
  await b.getByTestId('vote-skip').click();
  await b.getByTestId('vote-confirm').click();

  // Result: tallies for everyone and the reveal (the bots voted at random, so either outcome is fine).
  await expect(host.getByTestId('meeting-stage')).toHaveText('Result', { timeout: 60_000 });
  await expect(host.getByTestId('tally-row')).toHaveCount(7); // 6 players + Skip
  await expect(host.getByTestId('meeting-reveal')).toHaveText(
    /was (not )?an Imposter|No one was ejected/,
    { timeout: 5_000 },
  );
  await host.screenshot({ path: `${SHOT}-result.png` });

  // Back to the game (or the spectator view if the vote ejected the human): the timer did not move.
  await expect(host.getByTestId('meeting-screen')).toHaveCount(0, { timeout: 20_000 });
  await expect(host.getByTestId('match-timer')).toBeVisible();
  const after = await timerSeconds(host);
  expect(before - after).toBeGreaterThanOrEqual(0);
  expect(before - after).toBeLessThanOrEqual(15);
  await host.screenshot({ path: `${SHOT}-after.png` });
  // The allowance is spent: Guest A's button is disabled (or the whole screen is the spectator's).
  if ((await a.getByTestId('meeting-button').count()) > 0) {
    await expect(a.getByTestId('meeting-button')).toBeDisabled();
  } else {
    await expect(a.getByTestId('spectator-banner')).toBeVisible();
  }
});

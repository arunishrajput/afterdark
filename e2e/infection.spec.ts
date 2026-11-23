import { expect, test } from '@playwright/test';

import {
  advanceClock,
  captureFrames,
  enableTestMode,
  HOME,
  joinLobby,
  lobbyWithBots,
  newPlayer,
  setConfig,
  simTeleport,
  startAndReveal,
} from './helpers';

/**
 * Phase 7: a human imposter (host of 5 with the pinned room salt, see playwright.config.ts), a
 * human crew player and 3 bots, all in the GPS simulator. The imposter channels Infect on the crew
 * player, walks away and waits out the incubation; the crew player's screen only ever shows the
 * public infection boxes, and its raw Socket.IO payloads never mention infection.
 * Game time is moved with the test-mode `dev:advanceClock` (ADR-070), not waited for.
 */
test.describe.configure({ timeout: 170_000 });

const SHOT = 'test-results/phase07';
const M_PER_DEG_LAT = 111_320;
const metresNorth = (m: number) => m / M_PER_DEG_LAT;
const metresEast = (m: number) => m / (M_PER_DEG_LAT * Math.cos((HOME.lat * Math.PI) / 180));

test('imposter infects: channel, exposed, incubation, infected; crew sees only the boxes', async ({
  browser,
}) => {
  const host = await newPlayer(browser);
  const code = await lobbyWithBots(host, 3);
  await enableTestMode(host, { everyone: true });
  // The settings form saves the old co-op chance back: switch it off again (random co-op cards would change these flows).
  await setConfig(host, { coopChance: 0 });
  const guest = await newPlayer(browser);
  const frames = captureFrames(guest);
  await joinLobby(guest, code, 'Guest');
  await expect(guest.getByTestId('location-ok')).toBeVisible();
  await guest.getByTestId('ready-button').click();

  await startAndReveal(host);
  await expect(host.getByTestId('match-timer')).toBeVisible({ timeout: 20_000 });
  await expect(guest.getByTestId('match-timer')).toBeVisible({ timeout: 20_000 });
  await expect(host.getByTestId('role-chip')).toContainText('IMPOSTER');
  await expect(guest.getByTestId('role-chip')).toHaveText('CREW');
  await expect(host.getByTestId('imposter-panel')).toBeVisible();
  await expect(guest.getByTestId('imposter-panel')).toHaveCount(0);
  await expect(guest.getByTestId('infect-button')).toHaveCount(0);

  // The crew player stands about 67 m north of the Base; the imposter joins them 3 m to the east.
  const spot = { lat: HOME.lat + metresNorth(67), lng: HOME.lng };
  await simTeleport(guest, spot);
  await simTeleport(host, { lat: spot.lat, lng: spot.lng + metresEast(3) });

  // Infect starts on cooldown (RULES §7: every ability, 60 s). Skip the wait.
  const infect = host.getByTestId('infect-button');
  await expect(infect).toHaveAttribute('data-state', 'cooldown');
  await host.screenshot({ path: `${SHOT}-infect-cooldown.png` });
  await advanceClock(host, 60);
  await expect(infect).toHaveAttribute('data-state', 'ready', { timeout: 15_000 });
  await host.waitForTimeout(1500); // map tiles
  await host.screenshot({ path: `${SHOT}-infect-ready.png` });

  // The channel: a ring, "Stay close", and the 10 s are real.
  await infect.click();
  await expect(infect).toHaveAttribute('data-state', 'channel');
  await expect(host.getByTestId('infect-hint')).toContainText('Stay close');
  await expect(host.getByTestId('infect-cancel')).toBeVisible();
  await host.screenshot({ path: `${SHOT}-infect-channel.png` });
  // Nothing at all changes for the target.
  await expect(guest.getByTestId('status-banner')).toBeHidden();
  await expect(guest.getByText('Exposed')).toHaveCount(0);

  await expect(host.getByText('Exposed. Walk away to start the incubation.')).toBeVisible({
    timeout: 25_000,
  });
  await expect(infect).toHaveAttribute('data-state', 'cooldown');
  await expect(host.locator('.radar-dot--exposed')).toHaveCount(1);
  await host.getByTestId('infected-chip').click();
  await expect(host.getByTestId('infected-list')).toContainText('waiting for you to leave');
  await host.screenshot({ path: `${SHOT}-exposed-list.png` });
  await host.keyboard.press('Escape');

  // Walk away (25 m, still on the radar), then let game time run past the incubation.
  await simTeleport(host, { lat: spot.lat - metresNorth(25), lng: spot.lng });
  await advanceClock(host, 70);

  // The imposter's list moves them from exposed to infected; everyone's boxes fill and glitch.
  await expect(host.getByTestId('infected-chip')).toContainText('Infected: 1');
  await expect(host.locator('.radar-dot--infected')).toHaveCount(1);
  await expect(host.getByTestId('infection-boxes').locator('[data-filled="true"]')).toHaveCount(1);
  await expect(guest.getByTestId('infection-boxes').locator('[data-filled="true"]')).toHaveCount(1);
  await expect(guest.getByText('Someone has been compromised').first()).toBeVisible();
  await host.screenshot({ path: `${SHOT}-imposter-infected.png` });
  await guest.screenshot({ path: `${SHOT}-crew-boxes.png` });
  await host.getByTestId('infected-chip').click();
  await expect(host.getByTestId('infected-list')).toContainText('INFECTED (1)');
  await host.keyboard.press('Escape');

  // The crew player's UI and raw payloads: no infection beyond the public box count.
  await expect(guest.getByTestId('infected-chip')).toHaveCount(0);
  await expect(guest.getByTestId('imposter-panel')).toHaveCount(0);
  expect(frames.length).toBeGreaterThan(10);
  const raw = frames.join('\n');
  for (const needle of [
    '"infected"',
    '"exposed"',
    '"compromisedIds"',
    '"exposures"',
    '"incubationEndsAt"',
    'infect.completed',
    'infect.failed',
    '"imposter":',
    '"allies":',
  ]) {
    expect(raw, needle).not.toContain(needle);
  }
  expect(raw).toContain('game.compromised'); // the public count did arrive

  await host.context().close();
  await guest.context().close();
});

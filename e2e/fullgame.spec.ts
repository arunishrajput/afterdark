import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  advanceClock,
  captureFrames,
  createLobby,
  drawCircle,
  enableTestMode,
  finishFirstTask,
  forceCoop,
  HOME,
  joinLobby,
  myIds,
  newPlayer,
  pinPosition,
  setConfig,
  setMinigames,
  simTeleport,
  simTeleportToBase,
  spotInCard,
  startAndReveal,
} from './helpers';

/**
 * Phase 14 regression: one full 8-player game through every system. Two humans in the GPS
 * simulator (the host, crew; a guest who joins before the bots and so, with the pinned room salt,
 * draws seat 1: an imposter) and 6 in-process bots. Lobby → setup → spawn → reveal → a task →
 * Task Stop → an infection of the host → a co-op between the host and the imposter → a meeting and
 * vote → time-up → results → Play again. Every raw Socket.IO payload the crew host received before
 * the end is scanned for hidden information. Game time moves with `dev:advanceClock`.
 */
test.describe.configure({ timeout: 480_000 });

const SHOT = 'test-results/phase14-full';
const BIG_CIRCLE_DEG = 0.002; // about 195 m, so 8 spawns fit 40 m apart
const ABILITY_WAIT_S = 65; // every ability starts on a 60 s cooldown
const JAM_S = 31; // taskStopLockS is 30
const INCUBATION_WAIT_S = 70; // incubationS is 60
const MATCH_S = 600; // playTimeMin 10, the shortest the settings allow
const GATHER_WAIT_MS = 200_000; // meetingGatherS is 180 s; the bots walk to the Base
const M_PER_DEG_LAT = 111_320;
const metresNorth = (m: number) => m / M_PER_DEG_LAT;
const metresEast = (m: number) => m / (M_PER_DEG_LAT * Math.cos((HOME.lat * Math.PI) / 180));

/** The card's index in its list: section highlights are drawn in card order. */
const positionOf = (card: Locator) =>
  card.evaluate((el) => Array.from(el.parentElement?.children ?? []).indexOf(el));

/** Stage 1 → 2 → at the pin for one card (the spot follows the server's section rule). */
async function reachCardPin(page: Page, card: Locator) {
  const index = await positionOf(card);
  await simTeleport(page, await spotInCard(page, index));
  await expect(card).not.toHaveAttribute('data-stage', 'assigned', { timeout: 15_000 });
  await simTeleport(page, await pinPosition(page, index));
  await expect(card).toHaveAttribute('data-stage', 'atPin', { timeout: 15_000 });
}

test('a full 8-player game: every system, then results and Play again, with no leak to crew', async ({
  browser,
}) => {
  // ── Lobby and setup ──
  const host = await newPlayer(browser);
  const frames = captureFrames(host);
  const code = await createLobby(host, 'Host');
  await enableTestMode(host, { everyone: true, allAbilities: true });
  await host.getByTestId('map-expand').click();
  await drawCircle(host, BIG_CIRCLE_DEG);
  await host.getByTestId('map-expand').click();
  await expect(host.getByTestId('boundary-status')).toHaveText(/^Area /);
  const boundary = await host.getByTestId('boundary-status').textContent();

  const guest = await newPlayer(browser);
  await joinLobby(guest, code, 'Guest');
  await expect(guest.getByTestId('location-ok')).toBeVisible();
  await host.getByTestId('add-bots').click();
  await expect(host.getByTestId('roster-row')).toHaveCount(9);
  await host.getByRole('button', { name: 'Kick bot-7' }).click();
  await host.getByRole('button', { name: 'Confirm kicking bot-7' }).click();
  await expect(host.getByTestId('roster-row')).toHaveCount(8);
  // The settings form saves the old co-op chance back, so set the test numbers last.
  await setConfig(host, { coopChance: 0, playTimeMin: 10, meetingDiscussS: 30, meetingVoteS: 15 });
  await setMinigames(host, ['wires']);
  await host.screenshot({ path: `${SHOT}-lobby.png` });
  await guest.getByTestId('ready-button').click();

  // ── Spawn and reveal ──
  await startAndReveal(host);
  for (const p of [host, guest]) {
    await expect(p.getByTestId('match-timer')).toBeVisible({ timeout: 20_000 });
  }
  await expect(host.getByTestId('role-chip')).toHaveText('CREW');
  await expect(guest.getByTestId('role-chip')).toContainText('IMPOSTER');
  await expect(host.getByTestId('imposter-panel')).toHaveCount(0);
  const [hostIds, guestIds] = await Promise.all([myIds(host), myIds(guest)]);

  // ── A task ──
  await finishFirstTask(host, SHOT);
  await expect(host.getByTestId('team-score')).toContainText(/^\s*[1-9]/);

  // ── Task Stop jams the crew ──
  await advanceClock(host, ABILITY_WAIT_S);
  await expect(guest.getByTestId('ability-taskStop')).toHaveAttribute('data-state', 'ready', {
    timeout: 15_000,
  });
  await guest.getByTestId('ability-taskStop').click();
  await guest.getByTestId('taskstop-confirm').click();
  await expect(host.getByTestId('jam-overlay')).toContainText('SYSTEMS JAMMED');
  await host.screenshot({ path: `${SHOT}-jammed.png` });
  await advanceClock(host, JAM_S);
  await expect(host.getByTestId('jam-overlay')).toHaveCount(0, { timeout: 15_000 });

  // ── Infection of the host ──
  const spot = { lat: HOME.lat + metresNorth(67), lng: HOME.lng };
  await simTeleport(host, spot);
  await simTeleport(guest, { lat: spot.lat, lng: spot.lng + metresEast(3) });
  const infect = guest.getByTestId('infect-button');
  await expect(infect).toHaveAttribute('data-state', 'ready', { timeout: 15_000 });
  await infect.click();
  await expect(guest.getByText('Exposed. Walk away to start the incubation.')).toBeVisible({
    timeout: 25_000,
  });
  await simTeleport(guest, { lat: spot.lat - metresNorth(25), lng: spot.lng });
  await advanceClock(host, INCUBATION_WAIT_S);
  await expect(guest.getByTestId('infected-chip')).toContainText('Infected: 1', {
    timeout: 15_000,
  });
  const filled = '[data-filled="true"]';
  await expect(host.getByTestId('infection-boxes').locator(filled)).toHaveCount(1);
  await expect(host.getByTestId('infected-chip')).toHaveCount(0);

  // ── A co-op between the crew host and the imposter ──
  await forceCoop(host, hostIds.me ?? '', guestIds.me ?? '');
  const hostCard = host.locator('[data-testid="task-card"][data-kind="coop"]');
  const guestCard = guest.locator('[data-testid="task-card"][data-requested="true"]');
  await expect(hostCard).toHaveCount(1);
  await expect(guestCard).toHaveCount(1);
  await Promise.all([reachCardPin(host, hostCard), reachCardPin(guest, guestCard)]);
  await host.getByTestId('coop-start').click();
  await expect(hostCard.getByTestId('coop-waiting')).toBeVisible();
  await guest.getByTestId('coop-start').click();
  for (const p of [host, guest]) {
    await expect(p.getByTestId('coop-pin-panel')).toBeVisible({ timeout: 15_000 });
  }
  const pinOf = async (p: Page) => (await p.getByTestId('coop-show').textContent()) ?? '';
  const [hostPin, guestPin] = await Promise.all([pinOf(host), pinOf(guest)]);
  await host.getByTestId('coop-input').fill(guestPin);
  await host.getByTestId('coop-submit').click();
  await guest.getByTestId('coop-input').fill(hostPin);
  await guest.getByTestId('coop-submit').click();
  await expect(host.getByTestId('coop-sheet')).toHaveCount(0, { timeout: 15_000 });
  await expect(hostCard).toHaveCount(0); // credited: the co-op card is gone
  await expect(guestCard).toHaveCount(0);

  // ── A meeting and a vote ──
  await host.getByTestId('meeting-button').click();
  await host.getByTestId('meeting-confirm').click();
  for (const p of [host, guest]) {
    await expect(p.getByTestId('meeting-alarm')).toContainText('Host called a meeting');
    await expect(p.locator('html')).toHaveAttribute('data-theme', 'neutral');
  }
  await host.getByTestId('meeting-alarm').click();
  await guest.getByTestId('meeting-alarm').click();
  for (const p of [host, guest]) await simTeleportToBase(p);
  await expect(host.getByTestId('meeting-stage')).toHaveText('Discuss', {
    timeout: GATHER_WAIT_MS,
  });
  for (const p of [host, guest]) await p.getByTestId('skip-to-vote').click();
  await expect(host.getByTestId('meeting-stage')).toHaveText('Vote', { timeout: 40_000 });
  await host.getByTestId('vote-card').filter({ hasText: 'Guest' }).click();
  await host.getByTestId('vote-confirm').click();
  await guest.getByTestId('vote-skip').click();
  await guest.getByTestId('vote-confirm').click();
  await expect(host.getByTestId('meeting-stage')).toHaveText('Result', { timeout: 40_000 });
  await expect(host.getByTestId('meeting-reveal')).toHaveText(
    /was (not )?an Imposter|No one was ejected/,
  );
  await host.screenshot({ path: `${SHOT}-meeting-result.png` });
  // The bots' votes are random: the host may come back as a spectator.
  await expect(host.getByTestId('meeting-screen')).toHaveCount(0, { timeout: 20_000 });

  // ── Time-up, results ──
  await advanceClock(host, MATCH_S);
  for (const p of [host, guest]) {
    await expect(p.getByTestId('results-screen')).toBeVisible({ timeout: 20_000 });
  }
  await expect(host.getByTestId('ended-title')).toHaveText(/Crew wins|Imposters win|Draw/);
  await expect(host.getByTestId('who-card')).toHaveCount(8);
  await expect(host.locator('[data-testid="who-card"][data-role="imposter"]')).toHaveCount(2);
  await expect(host.getByTestId('meeting-row')).toHaveCount(1);
  await expect(host.getByTestId('timeline-row').first()).toBeVisible();
  await host.waitForTimeout(1500); // the cards finish flipping
  await host.screenshot({ path: `${SHOT}-results.png`, fullPage: true });

  // ── The raw payloads the crew host received before the end ──
  const end = frames.findIndex((f) => f.includes('"phase":"ended"'));
  expect(end).toBeGreaterThan(50);
  const before = frames.slice(0, end).join('\n');
  const after = frames.slice(end).join('\n');
  for (const needle of [
    '"role":"imposter"',
    '"imposter":',
    '"allies":',
    '"infected"',
    '"exposed"',
    '"compromisedIds"',
    '"exposures"',
    '"incubationEndsAt"',
    'infect.completed',
    'infect.failed',
    '"fakes":',
    'fakeOwnerId',
    '"secretSeed"',
    '"radarSalt"',
  ]) {
    expect(before, needle).not.toContain(needle);
  }
  expect(before).toContain('game.compromised'); // the public count did arrive
  // No other player's tag, except the co-op partner's on the co-op card (ROLES visibility matrix).
  const tags = new Set([...after.matchAll(/"tag":"([A-Z]+-\d{2})"/g)].map((m) => m[1]));
  expect(tags.size).toBe(8);
  for (const tag of tags) {
    if (tag === hostIds.tag || tag === guestIds.tag) continue;
    expect(before, `tag ${tag}`).not.toContain(`"${tag ?? ''}"`);
  }

  // ── Play again ──
  await host.getByTestId('results-play-again').click();
  for (const p of [host, guest]) {
    await expect(p.getByTestId('ready-button')).toBeVisible({ timeout: 15_000 });
  }
  await expect(host.getByTestId('boundary-status')).toHaveText(boundary ?? /^Area /);
  await expect(host.getByTestId('roster-row')).toHaveCount(8);
  await host.screenshot({ path: `${SHOT}-lobby-again.png` });

  for (const p of [host, guest]) await p.context().close();
});

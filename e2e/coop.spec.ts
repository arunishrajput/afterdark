import { expect, type Page, test } from '@playwright/test';

import {
  advanceClock,
  enableTestMode,
  forceCoop,
  joinLobby,
  lobbyWithBots,
  myIds,
  newPlayer,
  pinPosition,
  setConfig,
  setMinigames,
  simTeleport,
  spotInHighlight,
  startAndReveal,
} from './helpers';

/**
 * Phase 10: four humans in the GPS simulator and one bot (the pinned room salt makes one human the
 * imposter). Two crew players complete a co-op PIN Relay through the UI; then a camouflaged imposter
 * (its screen must read as crew) stands in for a waiting crew player's real partner and completes,
 * the owner sees a normal success and the real partner's card closes as an ordinary expiry.
 */
test.describe.configure({ timeout: 300_000 });

const SHOT = 'test-results/phase10';
const ABILITY_WAIT_S = 65;

const isImposter = async (p: Page) =>
  /IMPOSTER/.test((await p.getByTestId('role-chip').textContent()) ?? '');

/** Stage 1 → 2 → at the pin for `card` (the section highlights are drawn in card order, all cards still at Stage 1). */
const positionOf = (card: ReturnType<Page['locator']>) =>
  card.evaluate((el) => Array.from(el.parentElement?.children ?? []).indexOf(el));

async function reachPin(page: Page, card: ReturnType<Page['locator']>) {
  await expect(card).toHaveAttribute('data-stage', 'assigned');
  const highlight = await positionOf(card);
  await simTeleport(page, await spotInHighlight(page, highlight));
  await expect(card).not.toHaveAttribute('data-stage', 'assigned', { timeout: 25_000 });
  await simTeleport(page, await pinPosition(page, highlight));
  await expect(card).toHaveAttribute('data-stage', 'atPin', { timeout: 15_000 });
}

/** Each side shows a PIN and types the other's, as two people holding up their phones would. */
async function swapPins(a: Page, b: Page) {
  await expect(a.getByTestId('coop-pin-panel')).toBeVisible({ timeout: 15_000 });
  await expect(b.getByTestId('coop-pin-panel')).toBeVisible({ timeout: 15_000 });
  const pinA = (await a.getByTestId('coop-show').textContent()) ?? '';
  const pinB = (await b.getByTestId('coop-show').textContent()) ?? '';
  expect(pinA).toMatch(/^\d{4}$/);
  expect(pinB).toMatch(/^\d{4}$/);
  expect(pinA).not.toBe(pinB);
  // A first: a wrong PIN is refused, then the right one is accepted.
  await a.getByTestId('coop-input').fill(pinA);
  await a.getByTestId('coop-submit').click();
  await expect(a.getByTestId('coop-feedback')).toContainText('Not quite');
  await a.waitForTimeout(3500);
  await a.getByTestId('coop-input').fill(pinB);
  await a.getByTestId('coop-submit').click();
  await expect(a.getByTestId('coop-feedback')).toContainText('right');
  await b.getByTestId('coop-input').fill(pinA);
  await b.getByTestId('coop-submit').click();
}

test('two crew complete a co-op; a camouflaged imposter stands in for a real partner', async ({
  browser,
}) => {
  const host = await newPlayer(browser);
  const code = await lobbyWithBots(host, 1);
  await enableTestMode(host, { everyone: true, allAbilities: true });
  // The settings form saves the old co-op chance back: switch it off again (random co-op cards would change these flows).
  await setConfig(host, { coopChance: 0 });
  await setMinigames(host, ['wires']);
  const guests: Page[] = [];
  for (const name of ['Guest1', 'Guest2', 'Guest3']) {
    const g = await newPlayer(browser);
    await joinLobby(g, code, name);
    await expect(g.getByTestId('location-ok')).toBeVisible();
    await g.getByTestId('ready-button').click();
    guests.push(g);
  }
  await startAndReveal(host);
  const humans = [host, ...guests];
  for (const p of humans)
    await expect(p.getByTestId('match-timer')).toBeVisible({ timeout: 20_000 });

  const roles = await Promise.all(humans.map(isImposter));
  const imp = humans[roles.indexOf(true)];
  const crew = humans.filter((_, i) => !roles[i]);
  expect(roles.filter(Boolean), 'one human is the imposter (pinned room salt)').toHaveLength(1);
  expect(crew).toHaveLength(3);
  if (!imp) throw new Error('no imposter human');
  const [a, b, c] = crew as [Page, Page, Page];
  const ids = await Promise.all(humans.map(myIds));
  const idOf = (p: Page) => ids[humans.indexOf(p)]?.me ?? '';

  // ── Crew A + crew B ──
  await forceCoop(host, idOf(a), idOf(b));
  const cardA = a.locator('[data-testid="task-card"][data-kind="coop"]');
  const cardB = b.locator('[data-testid="task-card"][data-requested="true"]');
  await expect(cardA).toHaveCount(1);
  await expect(cardB).toHaveCount(1);
  await expect(cardA.getByTestId('task-label')).toContainText(/^Find [A-Z]+-\d{2} ·/);
  await expect(cardB).toContainText('Requested by a teammate');
  await a.screenshot({ path: `${SHOT}-coop-card.png` });
  // Both walk to the same section and then the pin.
  await Promise.all([reachPin(a, cardA), reachPin(b, cardB)]);
  await a.getByTestId('coop-start').click();
  await expect(a.getByTestId('coop-waiting')).toContainText('Waiting for');
  await a.screenshot({ path: `${SHOT}-coop-waiting.png` });
  await expect(b.getByTestId('coop-start')).toHaveText('Join');
  await b.getByTestId('coop-start').click();
  await swapPins(a, b);
  await b.screenshot({ path: `${SHOT}-coop-b-pin.png` });
  for (const p of [a, b]) {
    await expect(p.getByTestId('personal-score')).toHaveText(/You\s*6/, { timeout: 10_000 });
    await expect(p.getByTestId('coop-sheet')).toHaveCount(0, { timeout: 10_000 });
  }
  await expect(a.getByTestId('team-score')).toContainText('12 /');
  await expect(b.locator('[data-requested="true"]')).toHaveCount(0);

  // ── Crew C + a camouflaged imposter standing in for A ──
  await forceCoop(host, idOf(c), idOf(a));
  const cardC = c.locator('[data-testid="task-card"][data-kind="coop"]');
  const cardAReq = a.locator('[data-testid="task-card"][data-requested="true"]');
  await expect(cardC).toHaveCount(1);
  await expect(cardAReq).toHaveCount(1);
  await reachPin(c, cardC);
  await c.getByTestId('coop-start').click();
  await expect(c.getByTestId('coop-waiting')).toBeVisible();
  const pin = await pinPosition(c, await positionOf(cardC));

  // The imposter disguises itself: its phone must read as crew.
  await advanceClock(host, ABILITY_WAIT_S);
  await expect(imp.getByTestId('ability-camouflage')).toHaveAttribute('data-state', 'ready');
  await imp.screenshot({ path: `${SHOT}-imposter-plain.png` });
  await imp.getByTestId('ability-camouflage').click();
  await expect(imp.locator('html')).toHaveAttribute('data-theme', 'crew');
  await expect(imp.getByTestId('role-chip')).toHaveText('CREW');
  await expect(imp.getByTestId('ability-bar')).toHaveCount(0);
  await expect(imp.getByTestId('allies-chip')).toHaveCount(0);
  await expect(imp.getByTestId('task-card')).toHaveCount(3);
  await expect(imp.getByTestId('disguise-cue')).toBeVisible();
  await imp.screenshot({ path: `${SHOT}-imposter-camouflaged.png` });
  await c.screenshot({ path: `${SHOT}-crew-for-comparison.png` });

  // It walks to the pin, is offered the partner's seat, and takes it.
  await simTeleport(imp, pin);
  await expect(imp.getByTestId('coop-join-offer')).toBeVisible({ timeout: 15_000 });
  await imp.getByTestId('coop-join-partner').click();
  await swapPins(c, imp);
  await expect(c.getByTestId('personal-score')).toHaveText(/You\s*6/, { timeout: 10_000 });
  await expect(c.getByTestId('coop-sheet')).toHaveCount(0, { timeout: 10_000 });
  await expect(c.getByTestId('team-score')).toContainText('24 /');
  // The imposter earns nothing; the real partner's card closes as an ordinary expiry.
  await expect(imp.getByTestId('personal-score')).toHaveText(/You\s*0/);
  await expect(cardAReq).toHaveCount(0, { timeout: 10_000 });
  await expect(a.getByText('Co-op task expired')).toBeVisible();
  await expect(a.getByTestId('personal-score')).toHaveText(/You\s*6/);

  // Long-press on the timer reveals the real controls while the disguise lasts.
  await expect(imp.getByTestId('disguise-cue')).toBeVisible();
  await imp.getByTestId('timer-hold').click({ button: 'right' });
  await expect(imp.getByTestId('infect-button')).toBeVisible();

  for (const p of humans) await p.context().close();
});

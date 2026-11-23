import { expect, type Page, test } from '@playwright/test';

import {
  advanceClock,
  enableTestMode,
  fakesOf,
  joinLobby,
  lobbyWithBots,
  newPlayer,
  setConfig,
  setMinigames,
  simTeleport,
  startAndReveal,
} from './helpers';

/**
 * Phase 9: two humans (one is an imposter holding every ability, the other crew) and 3 bots, all in the
 * GPS simulator. The Phantom plants a fake task in placement mode; the crew player's next refilling slot
 * takes it; the Saboteur jams everything while the crew player has the minigame open (it resets, Start says
 * "Jammed", the overlay counts down for everyone); once the lock ends the crew player solves the wires and
 * is fooled: the ghost overlay, 0 points.
 */
test.describe.configure({ timeout: 240_000 });

const SHOT = 'test-results/phase09';
const RING_STEPS_M = [20, 40, 60];
const RING_BEARINGS = 8;
const METRES_PER_DEG = 111_000;
const ACCEPT_WAIT_MS = 1500;
const ABILITY_WAIT_S = 65;
const LOCK_S = 30;

/**
 * The map's centre is where the fake goes. The client can only check the boundary, so try spots on rings around the
 * centre until the server (which knows the task points) accepts one: it refuses anything within 30 m of a point.
 */
async function plantFake(page: Page) {
  await page.getByTestId('ability-fakeTask').click();
  await expect(page.getByTestId('fake-placer')).toBeVisible();
  await expect(page.getByTestId('placer-cross')).toBeVisible();
  const home = await page.evaluate(() => {
    const map = (
      window as unknown as { __afterdarkMap?: { getCenter(): { lat: number; lng: number } } }
    ).__afterdarkMap;
    return map?.getCenter();
  });
  if (!home) throw new Error('map test hook missing');
  const spots: { dLat: number; dLng: number }[] = [{ dLat: 0, dLng: 0 }];
  for (const ring of RING_STEPS_M) {
    for (let k = 0; k < RING_BEARINGS; k++) {
      const a = (2 * Math.PI * k) / RING_BEARINGS;
      spots.push({
        dLat: (ring * Math.cos(a)) / METRES_PER_DEG,
        dLng: (ring * Math.sin(a)) / METRES_PER_DEG,
      });
    }
  }
  for (const spot of spots) {
    await page.evaluate(
      ({ lat, lng }) => {
        const map = (
          window as unknown as {
            __afterdarkMap?: {
              setView(c: [number, number], z: number, o: object): void;
              getZoom(): number;
            };
          }
        ).__afterdarkMap;
        map?.setView([lat, lng], map.getZoom(), { animate: false });
      },
      { lat: home.lat + spot.dLat, lng: home.lng + spot.dLng },
    );
    await expect(page.getByTestId('fake-spot-status')).toHaveAttribute('data-valid', 'true');
    await page.getByTestId('fake-confirm').click();
    const done = await expect(page.getByTestId('fake-placer'))
      .toHaveCount(0, { timeout: ACCEPT_WAIT_MS })
      .then(
        () => true,
        () => false,
      );
    if (done) return;
  }
  throw new Error('the server never accepted a fake spot');
}

/** Connect every wire to its match by reading the accessible names (as tasks.spec does). */
async function solveWires(page: Page) {
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
  for (let i = 0; i < left.length; i++) {
    await page.getByTestId(`wire-left-${i}`).click();
    await page.getByTestId(`wire-right-${right.indexOf(left[i] as string)}`).click();
  }
  await page.getByTestId('wires-submit').click();
}

test('a Phantom plants a fake, a Saboteur jams the game, and the crew player is fooled', async ({
  browser,
}) => {
  const host = await newPlayer(browser);
  const code = await lobbyWithBots(host, 3);
  await enableTestMode(host, { everyone: true, allAbilities: true });
  // The settings form saves the old co-op chance back: switch it off again (random co-op cards would change these flows).
  await setConfig(host, { coopChance: 0 });
  await setMinigames(host, ['wires']);
  const guest = await newPlayer(browser);
  await joinLobby(guest, code, 'Guest');
  await expect(guest.getByTestId('location-ok')).toBeVisible();
  await guest.getByTestId('ready-button').click();
  await startAndReveal(host);
  for (const p of [host, guest]) {
    await expect(p.getByTestId('match-timer')).toBeVisible({ timeout: 20_000 });
  }

  // One human is an imposter with every ability, the other is crew (the room salt is pinned).
  const isImposter = async (p: Page) =>
    /IMPOSTER/.test((await p.getByTestId('role-chip').textContent()) ?? '');
  const imposter = (await isImposter(host)) ? host : guest;
  const crew = imposter === host ? guest : host;
  expect(await isImposter(crew), 'exactly one human is an imposter').toBe(false);

  // Both abilities start on cooldown, with rings and labels.
  await expect(imposter.getByTestId('ability-bar')).toBeVisible();
  await expect(imposter.getByTestId('ability-taskStop')).toHaveAttribute('data-state', 'cooldown');
  await expect(imposter.getByTestId('ability-fakeTask')).toHaveAttribute('data-state', 'cooldown');
  await expect(crew.getByTestId('ability-bar')).toHaveCount(0);
  await advanceClock(host, ABILITY_WAIT_S);
  await expect(imposter.getByTestId('ability-fakeTask')).toHaveAttribute('data-state', 'ready');
  await expect(imposter.getByTestId('ability-taskStop')).toHaveAttribute('data-state', 'ready');
  await imposter.screenshot({ path: `${SHOT}-ability-bar.png` });

  // Phantom: placement mode, then the fake shows on their own map, waiting.
  await plantFake(imposter);
  await expect(imposter.getByTestId('ability-fakeTask')).toHaveAttribute('data-state', 'cooldown');
  await expect(imposter.locator('.fake-pin')).toHaveCount(1);
  await expect(imposter.locator('.fake-pin--assigned')).toHaveCount(0);
  await imposter.screenshot({ path: `${SHOT}-fake-queued.png` });
  await expect(crew.locator('.fake-pin')).toHaveCount(0);

  // The crew player rerolls a card: the slot that refills takes the fake, and the Phantom sees it handed out.
  await crew.getByTestId('task-menu').first().click();
  await crew.getByTestId('task-reroll').click();
  await expect(imposter.locator('.fake-pin--assigned')).toHaveCount(1, { timeout: 10_000 });
  await expect(crew.getByTestId('task-card')).toHaveCount(3);

  // The crew player walks to the fake's spot, like to any task: the pin appears and they are at it.
  const [fake] = await fakesOf(imposter);
  if (!fake) throw new Error('the Phantom has no fake');
  await simTeleport(crew, { lat: fake.lat, lng: fake.lng });
  await expect(crew.locator('[data-testid="task-card"][data-stage="atPin"]')).toHaveCount(1, {
    timeout: 25_000,
  });
  await crew.getByTestId('task-start').click();
  await crew.getByTestId('task-safe-start').click();
  await expect(crew.getByTestId('minigame-wires')).toBeVisible();

  // Saboteur: confirm, and everyone's screen jams. The minigame resets and closes.
  await imposter.getByTestId('ability-taskStop').click();
  await imposter.getByTestId('taskstop-confirm').click();
  for (const p of [host, guest]) {
    await expect(p.getByTestId('jam-overlay')).toBeVisible();
    await expect(p.getByTestId('jam-overlay')).toContainText('SYSTEMS JAMMED');
  }
  await expect(crew.getByTestId('task-player')).toHaveCount(0, { timeout: 5000 });
  await expect(crew.getByText('Systems jammed. The task was reset.')).toBeVisible();
  await expect(crew.getByTestId('task-start')).toBeDisabled();
  await expect(crew.getByTestId('task-start')).toHaveText('Jammed');
  await crew.screenshot({ path: `${SHOT}-jammed.png` });
  await expect(imposter.getByTestId('ability-taskStop')).toHaveAttribute('data-state', 'cooldown');

  // Game time carries the lock: once it has passed, tasks work again.
  await advanceClock(host, LOCK_S + 1);
  for (const p of [host, guest]) await expect(p.getByTestId('jam-overlay')).toHaveCount(0);
  await expect(crew.getByTestId('task-start')).toBeEnabled();

  // Now the crew player is fooled: solved, no points, the ghost, dismissable after a beat.
  await crew.getByTestId('task-start').click();
  await crew.getByTestId('task-safe-start').click();
  await expect(crew.getByTestId('minigame-wires')).toBeVisible();
  await solveWires(crew);
  await expect(crew.getByTestId('fooled-overlay')).toContainText('You got fooled by a fake task!');
  await expect(crew.getByTestId('fooled-dismiss')).toBeDisabled();
  await crew.screenshot({ path: `${SHOT}-fooled.png` });
  await expect(crew.getByTestId('fooled-dismiss')).toBeEnabled({ timeout: 5000 });
  await expect(crew.getByTestId('personal-score')).toHaveText(/You\s*0/);
  await crew.getByTestId('fooled-dismiss').click();
  await expect(crew.getByTestId('task-player')).toHaveCount(0);
  // The Phantom's fake is used up: its pin is gone from their map.
  await expect(imposter.locator('.fake-pin')).toHaveCount(0, { timeout: 10_000 });
  await host.context().close();
  await guest.context().close();
});

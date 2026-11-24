import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Browser, expect, type Page, test } from '@playwright/test';

import {
  advanceClock,
  createLobby,
  drawCircle,
  enableTestMode,
  HOME,
  joinLobby,
  pinPosition,
  reachPin,
  setConfig,
  setMinigames,
  simTeleport,
  simTeleportToBase,
  spotInCard,
  startAndReveal,
  startTask,
} from '../../e2e/helpers';

const OUT = join(import.meta.dirname, '..', 'public', 'footage');
mkdirSync(OUT, { recursive: true });
const BIG_CIRCLE_DEG = 0.002;
const M_PER_DEG_LAT = 111_320;
const metresNorth = (m: number) => m / M_PER_DEG_LAT;
const metresEast = (m: number) => m / (M_PER_DEG_LAT * Math.cos((HOME.lat * Math.PI) / 180));
const SIZE = { width: 390, height: 844 };

const marks: Record<string, Record<string, number>> = { host: {}, guest: {} };
const t0: Record<string, number> = {};

async function phone(browser: Browser, who: 'host' | 'guest') {
  const ctx = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 2,
    recordVideo: { dir: join(OUT, `_raw-${who}`), size: { width: 780, height: 1688 } },
  });
  const page = await ctx.newPage();
  t0[who] = Date.now();
  return page;
}
const mark = (who: 'host' | 'guest', name: string) => {
  marks[who][name] = (Date.now() - (t0[who] ?? 0)) / 1000;
};
const shot = async (page: Page, who: 'host' | 'guest', name: string) => {
  mark(who, name);
  await page.screenshot({ path: join(OUT, `${who}-${name}.png`) });
};
const attempt = async (label: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    console.log(`SKIPPED ${label}: ${String(e).slice(0, 160)}`);
  }
};

test('capture the trailer footage', async ({ browser }) => {
  // ── Desktop Home (hero + live night map) ──
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const dp = await desk.newPage();
  await dp.goto('/');
  await dp.waitForTimeout(4500);
  await dp.screenshot({ path: join(OUT, 'home-desktop.png') });
  await desk.close();

  // ── Lobby + setup ──
  const host = await phone(browser, 'host');
  await host.goto('/');
  await host.waitForTimeout(1500);
  await shot(host, 'host', 'home');
  const code = await createLobby(host, 'Nova');
  await shot(host, 'host', 'lobby-empty');
  await enableTestMode(host, { everyone: true, allAbilities: true });
  await host.getByTestId('map-expand').click();
  await drawCircle(host, BIG_CIRCLE_DEG);
  await host.waitForTimeout(800);
  await shot(host, 'host', 'draw-area');
  await host.getByTestId('map-expand').click();
  await expect(host.getByTestId('boundary-status')).toHaveText(/^Area /);

  const guest = await phone(browser, 'guest');
  await joinLobby(guest, code, 'Raven');
  await expect(guest.getByTestId('location-ok')).toBeVisible();
  await host.getByTestId('add-bots').click();
  await expect(host.getByTestId('roster-row')).toHaveCount(9);
  await host.getByRole('button', { name: 'Kick bot-7' }).click();
  await host.getByRole('button', { name: 'Confirm kicking bot-7' }).click();
  await expect(host.getByTestId('roster-row')).toHaveCount(8);
  await setConfig(host, { coopChance: 0, playTimeMin: 10, meetingDiscussS: 30, meetingVoteS: 15 });
  await host.waitForTimeout(1200);
  await shot(host, 'host', 'lobby-full');
  await guest.getByTestId('ready-button').click();

  // ── Spawn + reveal ──
  await expect(host.getByTestId('ready-button')).toBeEnabled();
  await host.getByTestId('ready-button').click();
  await expect(host.getByTestId('spawn-title')).toBeVisible({ timeout: 15_000 });
  await host.waitForTimeout(2500);
  await shot(host, 'host', 'spawn');
  await host.getByTestId('force-start').click();
  await expect(host.getByTestId('reveal-hold')).toBeVisible();
  mark('host', 'reveal-start');
  mark('guest', 'reveal-start');
  for (const [p, who] of [[host, 'host'], [guest, 'guest']] as const) {
    const box = await p.getByTestId('reveal-hold').boundingBox();
    if (box) {
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await p.mouse.down();
    }
    await p.waitForTimeout(1600);
    await shot(p, who, 'reveal-held');
    await p.mouse.up();
  }
  for (const p of [host, guest]) await expect(p.getByTestId('match-timer')).toBeVisible({ timeout: 20_000 });
  await host.waitForTimeout(2500);
  await shot(host, 'host', 'game');
  await shot(guest, 'guest', 'game');

  // ── Minigames (one of each) ──
  const types = ['wires', 'lock', 'pattern', 'signal', 'slide', 'crossword'];
  for (const type of types) {
    await attempt(`minigame ${type}`, async () => {
      await setMinigames(host, [type]);
      await reachPin(host, join(OUT, '_tmp'));
      const taskId = await host.evaluate(
        () =>
          (window as unknown as { __afterdarkActions: { cardsOf(): { id: string }[] } }).__afterdarkActions.cardsOf()[0]?.id,
      );
      mark('host', `mg-${type}-start`);
      await startTask(host);
      await expect(host.getByTestId('task-player')).toBeVisible();
      await host.waitForTimeout(1800);
      await shot(host, 'host', `mg-${type}`);
      await host.waitForTimeout(800);
      const res = await host.evaluate(
        (id) =>
          (window as unknown as { __afterdarkActions: { devAutoComplete(i: string): Promise<{ ok: boolean }> } }).__afterdarkActions.devAutoComplete(id),
        taskId as string,
      );
      expect(res.ok).toBe(true);
      await expect(host.getByTestId('task-player')).toHaveCount(0, { timeout: 8000 });
      await host.waitForTimeout(1200);
      mark('host', `mg-${type}-done`);
    });
  }
  await shot(host, 'host', 'game-scored');

  // ── Task Stop jams the crew ──
  await advanceClock(host, 65);
  await expect(guest.getByTestId('ability-taskStop')).toHaveAttribute('data-state', 'ready', { timeout: 15_000 });
  await shot(guest, 'guest', 'ability-bar');
  mark('guest', 'jam-start');
  await guest.getByTestId('ability-taskStop').click();
  await guest.getByTestId('taskstop-confirm').click();
  await expect(host.getByTestId('jam-overlay')).toContainText('SYSTEMS JAMMED');
  await host.waitForTimeout(1500);
  await shot(host, 'host', 'jammed');
  await shot(guest, 'guest', 'jammed');
  await advanceClock(host, 31);
  await expect(host.getByTestId('jam-overlay')).toHaveCount(0, { timeout: 15_000 });

  // ── Infection ──
  const spot = { lat: HOME.lat + metresNorth(67), lng: HOME.lng };
  await simTeleport(host, spot);
  await simTeleport(guest, { lat: spot.lat, lng: spot.lng + metresEast(3) });
  await host.waitForTimeout(1500);
  const infect = guest.getByTestId('infect-button');
  await expect(infect).toHaveAttribute('data-state', 'ready', { timeout: 15_000 });
  await shot(guest, 'guest', 'infect-ready');
  mark('guest', 'infect-start');
  await infect.click();
  await guest.waitForTimeout(3500);
  await shot(guest, 'guest', 'infect-channel');
  await expect(guest.getByText('Exposed. Walk away to start the incubation.')).toBeVisible({ timeout: 25_000 });
  await shot(guest, 'guest', 'infect-exposed');
  await simTeleport(guest, { lat: spot.lat - metresNorth(25), lng: spot.lng });
  await advanceClock(host, 70);
  await expect(host.getByTestId('infection-boxes').locator('[data-filled="true"]')).toHaveCount(1, { timeout: 15_000 });
  await host.waitForTimeout(1500);
  await shot(host, 'host', 'boxes-filled');
  await shot(guest, 'guest', 'infected-list');

  // ── Camouflage ──
  await attempt('camouflage', async () => {
    await expect(guest.getByTestId('ability-camouflage')).toHaveAttribute('data-state', 'ready', { timeout: 8000 });
    mark('guest', 'camo-start');
    await guest.getByTestId('ability-camouflage').click();
    await guest.waitForTimeout(1800);
    await shot(guest, 'guest', 'camouflaged');
  });

  // ── Meeting ──
  mark('host', 'meeting-start');
  await host.getByTestId('meeting-button').click();
  await host.getByTestId('meeting-confirm').click();
  for (const p of [host, guest]) await expect(p.getByTestId('meeting-alarm')).toBeVisible();
  await host.waitForTimeout(1200);
  await shot(host, 'host', 'meeting-alarm');
  await shot(guest, 'guest', 'meeting-alarm');
  await host.getByTestId('meeting-alarm').click();
  await guest.getByTestId('meeting-alarm').click();
  await shot(host, 'host', 'meeting-gather');
  await attempt('meeting map', async () => {
    await host.getByTestId('meeting-show-map').click();
    await host.waitForTimeout(1500);
    await shot(host, 'host', 'meeting-map');
    await host.getByTestId('meeting-back').click();
  });
  for (const p of [host, guest]) await simTeleportToBase(p);
  await expect(host.getByTestId('meeting-stage')).toHaveText('Discuss', { timeout: 200_000 });
  await host.waitForTimeout(1000);
  await shot(host, 'host', 'meeting-discuss');
  for (const p of [host, guest]) await p.getByTestId('skip-to-vote').click();
  await expect(host.getByTestId('meeting-stage')).toHaveText('Vote', { timeout: 40_000 });
  await host.waitForTimeout(800);
  await shot(host, 'host', 'meeting-vote');
  await host.getByTestId('vote-card').filter({ hasText: 'Raven' }).click();
  await host.getByTestId('vote-confirm').click();
  await guest.getByTestId('vote-skip').click();
  await guest.getByTestId('vote-confirm').click();
  await expect(host.getByTestId('meeting-stage')).toHaveText('Result', { timeout: 40_000 });
  await host.waitForTimeout(1500);
  await shot(host, 'host', 'meeting-result');
  await expect(host.getByTestId('meeting-screen')).toHaveCount(0, { timeout: 20_000 });

  // ── Results ──
  await advanceClock(host, 600);
  for (const p of [host, guest]) await expect(p.getByTestId('results-screen')).toBeVisible({ timeout: 20_000 });
  mark('host', 'results-start');
  await host.waitForTimeout(3500);
  await shot(host, 'host', 'results');
  await host.screenshot({ path: join(OUT, 'host-results-full.png'), fullPage: true });
  await shot(guest, 'guest', 'results');
  mark('host', 'end');
  mark('guest', 'end');

  // finalize videos
  const hv = host.video();
  const gv = guest.video();
  await host.context().close();
  await guest.context().close();
  if (hv) copyFileSync(await hv.path(), join(OUT, 'host.webm'));
  if (gv) copyFileSync(await gv.path(), join(OUT, 'guest.webm'));
  writeFileSync(join(OUT, 'marks.json'), JSON.stringify(marks, null, 2));
  void pinPosition;
  void spotInCard;
});

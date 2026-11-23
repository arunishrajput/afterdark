import { type Browser, expect, type Page } from '@playwright/test';

const MIN_STREET_ZOOM = 15;

/** Where the simulated players start (also the demo area). */
export const HOME = { lat: 28.6139, lng: 77.209 };
/** `?sim=1` plus a start position: the GPS simulator takes over once the lobby is in test mode. */
export const SIM_QUERY = `sim=1&lat=${HOME.lat}&lng=${HOME.lng}`;

/** One isolated browser context per player (separate localStorage = separate device). */
export async function newPlayer(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  return ctx.newPage();
}

export async function fillEntry(page: Page, name: string, submit: string) {
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: submit }).click();
}

export async function createLobby(page: Page, name: string, query = SIM_QUERY): Promise<string> {
  await page.goto(`/?${query}`);
  await page.getByRole('button', { name: 'Create game' }).click();
  await fillEntry(page, name, 'Create lobby');
  const code = (await page.getByTestId('lobby-code').textContent()) ?? '';
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  return code;
}

export async function joinLobby(page: Page, code: string, name: string, query = SIM_QUERY) {
  await page.goto(`/?code=${code}&${query}`);
  await expect(page.getByLabel('Lobby code')).toHaveValue(code); // ?code= pre-fills Join
  await page.getByRole('button', { name: 'Join game' }).click();
  await fillEntry(page, name, 'Join lobby');
  await expect(page.getByTestId('lobby-code')).toHaveText(code);
}

/**
 * Host: Settings → Test mode on → Save. Everyone's simulator starts once they see the flag.
 * `everyone: true` also sets "Who you see on the map" to Everyone (the default only shows players within 40 m).
 */
export async function enableTestMode(
  host: Page,
  opts: { everyone?: boolean; allAbilities?: boolean } = {},
) {
  await host.getByRole('button', { name: 'Edit' }).click();
  await host.getByTestId('setting-testMode').check();
  if (opts.everyone) {
    await host
      .getByRole('radiogroup', { name: 'Who you see on the map' })
      .getByRole('radio', { name: 'Everyone' })
      .click();
  }
  if (opts.allAbilities) {
    await host
      .getByRole('radiogroup', { name: 'Imposter abilities' })
      .getByRole('radio', { name: 'All three' })
      .click();
  }
  await host.getByTestId('settings-save').click();
  await expect(host.getByText('TEST MODE', { exact: true })).toBeVisible();
}

/** Test hook: change host settings without the form (host, lobby). */
export async function setConfig(page: Page, patch: Record<string, unknown>) {
  const res = await page.evaluate(
    (p) =>
      (window as unknown as { __afterdarkActions: Actions }).__afterdarkActions.devUpdateConfig(p),
    patch,
  );
  expect(res.ok).toBe(true);
}

/** Test hook: the viewer's own id and tag. */
export async function myIds(page: Page) {
  return page.evaluate(() =>
    (window as unknown as { __afterdarkActions: Actions }).__afterdarkActions.myIds(),
  );
}

/** Test hook (host, test mode, playing): turn the owner's first card into a co-op task with `partnerId`. */
export async function forceCoop(host: Page, ownerId: string, partnerId: string) {
  const res = await host.evaluate(
    ([o, p]) =>
      (window as unknown as { __afterdarkActions: Actions }).__afterdarkActions.devForceCoop(
        o as string,
        p as string,
      ),
    [ownerId, partnerId],
  );
  expect(res, `dev:forceCoop answered ${JSON.stringify(res)}`).toMatchObject({ ok: true });
}

interface TestMap {
  setZoom(z: number): void;
  getZoom(): number;
  getCenter(): { lat: number; lng: number };
  latLngToContainerPoint(p: [number, number]): { x: number; y: number };
  getContainer(): HTMLElement;
}

/** Page-pixel position of a point `dLng` degrees east of the map centre (0 = the centre). */
export async function mapPoint(page: Page, dLng = 0, dLat = 0) {
  return page.evaluate(
    ({ dLng, dLat }) => {
      const map = (window as unknown as { __afterdarkMap?: TestMap }).__afterdarkMap;
      if (!map) throw new Error('map test hook missing');
      const c = map.getCenter();
      const p = map.latLngToContainerPoint([c.lat + dLat, c.lng + dLng]);
      const box = map.getContainer().getBoundingClientRect();
      return { x: box.left + p.x, y: box.top + p.y };
    },
    { dLng, dLat },
  );
}

/** Host draws a circle with the real Geoman circle tool: click the centre, then click the edge. */
export async function drawCircle(host: Page, radiusDegLng = 0.001) {
  // The map centres on the player (street level) once their first fix arrives; wait for that.
  await expect
    .poll(() =>
      host.evaluate(
        () => (window as unknown as { __afterdarkMap?: TestMap }).__afterdarkMap?.getZoom() ?? 0,
      ),
    )
    .toBeGreaterThanOrEqual(MIN_STREET_ZOOM);
  await host.locator('.leaflet-pm-icon-circle').click();
  const centre = await mapPoint(host);
  const edge = await mapPoint(host, radiusDegLng);
  await host.mouse.move(centre.x, centre.y);
  await host.mouse.click(centre.x, centre.y);
  await host.mouse.move((centre.x + edge.x) / 2, edge.y, { steps: 4 });
  await host.mouse.move(edge.x, edge.y, { steps: 4 });
  await host.mouse.click(edge.x, edge.y);
}

/** Zoom the map out so points well outside the boundary are on screen. */
export async function zoomTo(page: Page, zoom: number) {
  await page.evaluate((z) => {
    const map = (window as unknown as { __afterdarkMap?: TestMap }).__afterdarkMap;
    map?.setZoom(z);
  }, zoom);
  await page.waitForTimeout(500); // the zoom animation
}

/** Press and hold on a map point long enough to trigger the simulator's long-press teleport. */
export async function longPress(page: Page, at: { x: number; y: number }) {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
}

const BIG_CIRCLE_DEG = 0.002; // about 195 m, so even 8 spawns fit 40 m apart

/** Host with test mode on, a drawn ~195 m area and `bots` in-process bots (the surplus ones kicked). */
export async function lobbyWithBots(page: Page, bots: number): Promise<string> {
  const code = await createLobby(page, 'Human');
  await enableTestMode(page);
  // Full screen, so the whole big circle is on screen for the real drawing tool.
  await page.getByTestId('map-expand').click();
  await drawCircle(page, BIG_CIRCLE_DEG);
  await page.getByTestId('map-expand').click();
  await expect(page.getByTestId('boundary-status')).toHaveText(/^Area /);
  await expect(page.getByTestId('location-ok')).toBeVisible();
  await page.getByTestId('add-bots').click();
  await expect(page.getByTestId('roster-row')).toHaveCount(8);
  if (bots < 7) {
    for (let i = 7; i > bots; i--) {
      await page.getByRole('button', { name: `Kick bot-${i}` }).click();
      await page.getByRole('button', { name: `Confirm kicking bot-${i}` }).click();
    }
    await expect(page.getByTestId('roster-row')).toHaveCount(bots + 1);
  }
  // Co-op tasks are random, so game specs run with them off; a co-op spec pairs players with `forceCoop`.
  await setConfig(page, { coopChance: 0 });
  return code;
}

/** Ready up, wait for the spawn phase, force-start it: the role reveal screen is showing. */
export async function startAndReveal(page: Page) {
  await expect(page.getByTestId('ready-button')).toBeEnabled();
  await page.getByTestId('ready-button').click();
  await expect(page.getByTestId('spawn-title')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('spawn-count')).toContainText(/\d+\/\d+ in position/);
  await page.getByTestId('force-start').click();
  await expect(page.getByTestId('reveal-hold')).toBeVisible();
}

/** Lobby with 7 bots → reveal → play: the HUD and the task cards are showing. */
export async function toPlaying(page: Page, opts: { minigames?: string[] } = {}) {
  await lobbyWithBots(page, 7);
  if (opts.minigames) await setMinigames(page, opts.minigames);
  await startAndReveal(page);
  await expect(page.getByTestId('match-timer')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('task-card')).toHaveCount(3);
}

interface Actions {
  devAdvanceClock(seconds: number): Promise<{ ok: boolean }>;
  devSetMinigames(types: string[]): Promise<{ ok: boolean }>;
  simTeleport(to: { lat: number; lng: number }): Promise<{ ok: boolean }>;
  devForceCoop(
    ownerId: string,
    partnerId: string,
  ): Promise<{ ok: boolean; code?: string; message?: string }>;
  devUpdateConfig(patch: Record<string, unknown>): Promise<{ ok: boolean }>;
  myIds(): { me: string | undefined; tag: string | undefined; players: string[] };
  baseOf(): { lat: number; lng: number } | undefined;
  fakesOf(): { id: string; lat: number; lng: number; assigned: boolean }[];
}

/** Test hook (`window.__afterdarkActions`): host picks which minigames can be rolled, before the game starts. */
export async function setMinigames(page: Page, types: string[]) {
  const res = await page.evaluate(
    (t) =>
      (window as unknown as { __afterdarkActions: Actions }).__afterdarkActions.devSetMinigames(t),
    types,
  );
  expect(res.ok).toBe(true);
}

/** Test hook: jump game time forward (host, test mode, playing): cooldowns and incubation end sooner. */
export async function advanceClock(page: Page, seconds: number) {
  const res = await page.evaluate(
    (n) =>
      (window as unknown as { __afterdarkActions: Actions }).__afterdarkActions.devAdvanceClock(n),
    seconds,
  );
  expect(res.ok).toBe(true);
}

/**
 * Every Socket.IO payload this page receives, as text: WebSocket frames and long-polling
 * responses (the first requests go over polling before the upgrade). For raw leak scans.
 * Call it before navigating.
 */
export function captureFrames(page: Page): string[] {
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  page.on('response', (res) => {
    if (!res.url().includes('/socket.io/')) return;
    void res.text().then(
      (t) => frames.push(t),
      () => undefined,
    );
  });
  return frames;
}

/** Hop the simulated player to a place, the same call a long-press makes. */
export async function simTeleport(page: Page, to: { lat: number; lng: number }) {
  const res = await page.evaluate(
    (p) => (window as unknown as { __afterdarkActions: Actions }).__afterdarkActions.simTeleport(p),
    to,
  );
  expect(res.ok).toBe(true);
}

/** A Phantom's own fakes, read from their view (the pin positions are theirs to know). */
export async function fakesOf(page: Page) {
  return page.evaluate(() =>
    (window as unknown as { __afterdarkActions: Actions }).__afterdarkActions.fakesOf(),
  );
}

/** Hop the simulated player onto the Base (it is on every player's map), for a meeting. */
export async function simTeleportToBase(page: Page) {
  const base = await page.evaluate(() =>
    (window as unknown as { __afterdarkActions: Actions }).__afterdarkActions.baseOf(),
  );
  if (!base) throw new Error('no Base in the view');
  await simTeleport(page, base);
}

/**
 * A spot well inside the highlighted section number `index` (the `index`-th highlight drawn on the
 * map), found the way a player would: look at the highlight and pick a spot inside it. Returns lat/lng.
 */
export async function spotInHighlight(
  page: Page,
  index = 0,
): Promise<{ lat: number; lng: number }> {
  return page.evaluate((i) => {
    const map = (
      window as unknown as {
        __afterdarkMap?: TestMap & {
          containerPointToLatLng(p: [number, number]): { lat: number; lng: number };
        };
      }
    ).__afterdarkMap;
    if (!map) throw new Error('map test hook missing');
    const path = document.querySelectorAll<SVGGeometryElement>('path.task-section')[i];
    if (!path) throw new Error('no section highlight');
    const svg = path.ownerSVGElement;
    const ctm = path.getScreenCTM();
    if (!svg || !ctm) throw new Error('no svg');
    const box = path.getBBox();
    const inside = (x: number, y: number) => path.isPointInFill(new DOMPoint(x, y));
    // The point whose ring of neighbours is all inside the highlight is the safest from the edges.
    let best: { x: number; y: number; score: number } | undefined;
    const steps = 24;
    for (let a = 0; a <= steps; a++) {
      for (let b = 0; b <= steps; b++) {
        const x = box.x + (box.width * a) / steps;
        const y = box.y + (box.height * b) / steps;
        if (!inside(x, y)) continue;
        let score = 0;
        for (const r of [6, 12, 18, 24]) {
          for (let k = 0; k < 8; k++) {
            const t = (k / 8) * 2 * Math.PI;
            if (inside(x + r * Math.cos(t), y + r * Math.sin(t))) score++;
          }
        }
        if (!best || score > best.score) best = { x, y, score };
      }
    }
    if (!best) throw new Error('no spot inside the highlight');
    const screen = new DOMPoint(best.x, best.y).matrixTransform(ctm);
    const frame = map.getContainer().getBoundingClientRect();
    const ll = map.containerPointToLatLng([screen.x - frame.left, screen.y - frame.top]);
    return { lat: ll.lat, lng: ll.lng };
  }, index);
}

/** lat/lng of the `index`-th revealed pin on the map. */
export async function pinPosition(page: Page, index = 0): Promise<{ lat: number; lng: number }> {
  return page.evaluate((i) => {
    const map = (
      window as unknown as {
        __afterdarkMap?: TestMap & {
          containerPointToLatLng(p: [number, number]): { lat: number; lng: number };
        };
      }
    ).__afterdarkMap;
    const pin = document.querySelectorAll<HTMLElement>('.task-pin')[i];
    if (!map || !pin) throw new Error('no pin on the map');
    const r = pin.getBoundingClientRect();
    const frame = map.getContainer().getBoundingClientRect();
    const ll = map.containerPointToLatLng([
      r.left + r.width / 2 - frame.left,
      r.top + r.height / 2 - frame.top,
    ]);
    return { lat: ll.lat, lng: ll.lng };
  }, index);
}

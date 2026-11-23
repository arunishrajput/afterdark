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
export async function enableTestMode(host: Page, opts: { everyone?: boolean } = {}) {
  await host.getByRole('button', { name: 'Edit' }).click();
  await host.getByTestId('setting-testMode').check();
  if (opts.everyone) {
    await host
      .getByRole('radiogroup', { name: 'Who you see on the map' })
      .getByRole('radio', { name: 'Everyone' })
      .click();
  }
  await host.getByTestId('settings-save').click();
  await expect(host.getByText('TEST MODE', { exact: true })).toBeVisible();
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

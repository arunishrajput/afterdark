import { expect, type Page, test } from '@playwright/test';

import {
  createLobby,
  drawCircle,
  enableTestMode,
  joinLobby,
  newPlayer,
  waitForMapStill,
} from './helpers';

// Four browser contexts and a drawn map: allow more than the 30 s default.
test.describe.configure({ timeout: 90_000 });

const label = (page: Page) => page.locator('.region-label');
const points = (page: Page) => page.locator('.task-point');
const RECT_HALF_PX = 20;

/** Page position of the task point nearest the middle of the map frame, clear of the player's own marker and the edges. */
async function pointNearMiddle(page: Page) {
  return page.evaluate(() => {
    const frame = document.querySelector('[data-testid="map-frame"]')?.getBoundingClientRect();
    if (!frame) throw new Error('no map frame');
    const cx = frame.left + frame.width / 2;
    const cy = frame.top + frame.height / 2;
    const margin = 50;
    const spots = [...document.querySelectorAll('.task-point')]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })
      .filter(
        (p) =>
          p.x > frame.left + margin &&
          p.x < frame.right - margin &&
          p.y > frame.top + margin &&
          p.y < frame.bottom - margin &&
          Math.hypot(p.x - cx, p.y - cy) > 40,
      )
      .sort((p, q) => Math.hypot(p.x - cx, p.y - cy) - Math.hypot(q.x - cx, q.y - cy));
    const best = spots[0];
    if (!best) throw new Error('no task point on screen');
    return best;
  });
}

/**
 * Taps bare map (real mouse click) at the spot within the drawn circle (about 55 px of the player's marker) that is furthest
 * from every task point and the Base, so the tap lands on the map and not on one of them.
 */
async function tapBareMap(page: Page) {
  await page.getByTestId('map-frame').scrollIntoViewIfNeeded(); // a real click must land inside the viewport
  const at = await page.evaluate(() => {
    const frame = document.querySelector('[data-testid="map-frame"]')?.getBoundingClientRect();
    if (!frame) throw new Error('no map frame');
    const cx = frame.left + frame.width / 2;
    const cy = frame.top + frame.height / 2;
    const markers = [...document.querySelectorAll('.point-marker, .base-marker')].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    let best: { x: number; y: number; gap: number } | undefined;
    for (let dx = -60; dx <= 60; dx += 6) {
      for (let dy = -60; dy <= 60; dy += 6) {
        const x = cx + dx;
        const y = cy + dy;
        if (Math.hypot(dx, dy) > 55 || Math.hypot(dx, dy) < 24) continue; // clear of the player's marker
        const gap = Math.min(...markers.map((m) => Math.hypot(m.x - x, m.y - y)));
        if (!best || gap > best.gap) best = { x, y, gap };
      }
    }
    if (!best || best.gap < 14) throw new Error('no bare spot found near the middle of the map');
    return best;
  });
  await page.mouse.click(at.x, at.y);
}

/**
 * Clicks (with the real mouse) a task point near the middle of the map but clear of the player's
 * own marker (which sits at the centre) and of the map's edge buttons.
 */
async function tapNearestPoint(page: Page) {
  await page.getByTestId('map-frame').scrollIntoViewIfNeeded();
  const at = await page.evaluate(
    ({ CLEAR_OF_SELF_PX, EDGE_PX }) => {
      const frame = document.querySelector('[data-testid="map-frame"]')?.getBoundingClientRect();
      if (!frame) throw new Error('no map frame');
      const cx = frame.left + frame.width / 2;
      const cy = frame.top + frame.height / 2;
      let best: { x: number; y: number; d: number } | undefined;
      for (const el of document.querySelectorAll('.point-marker')) {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const d = Math.hypot(x - cx, y - cy);
        const clear = d > CLEAR_OF_SELF_PX && x > frame.left + EDGE_PX && x < frame.right - EDGE_PX;
        const inside = y > frame.top + EDGE_PX && y < frame.bottom - EDGE_PX;
        if (clear && inside && (!best || d < best.d)) best = { x, y, d };
      }
      if (!best) throw new Error('no task point on the map');
      return best;
    },
    { CLEAR_OF_SELF_PX: 36, EDGE_PX: 56 },
  );
  await page.mouse.click(at.x, at.y);
}

test('host draws, sees regions, renames one, deletes a point, places the Base; the checklist goes green and a guest sees the same map', async ({
  browser,
}) => {
  const names = ['Ann', 'Bea', 'Cy', 'Di'];
  const pages = await Promise.all(names.map(() => newPlayer(browser)));
  const [host, ...guests] = pages as [Page, ...Page[]];
  const guest = guests[0] as Page;

  const code = await createLobby(host, 'Ann');
  await enableTestMode(host);
  for (const [i, page] of guests.entries()) await joinLobby(page, code, names[i + 1] ?? '');

  // Before any setup the checklist names what is missing.
  const checklist = host.getByRole('region', { name: 'Before we start' });
  await expect(checklist).toContainText('Playable area drawn on the map');
  await expect(host.getByTestId('boundary-status')).toHaveText('Draw the playable area');

  // ① Boundary: a ~100 m circle gives 2 regions (area under 40,000 m²), a default Base and points.
  await drawCircle(host);
  await expect(host.getByTestId('boundary-status')).toHaveText(/\d regions$/);
  await expect(label(host)).toHaveCount(2);
  await expect(label(guest)).toHaveCount(2);
  await expect(label(guest).first()).toContainText('Region A');
  await expect(host.locator('.base-flag')).toHaveCount(1);
  const pointCount = await points(host).count();
  expect(pointCount).toBeGreaterThanOrEqual(16);
  await expect(points(guest)).toHaveCount(pointCount); // the guest reviews the same points for safety
  await expect(host.getByTestId('step-boundary')).toContainText('✓');

  // Region counts show on the labels (a bucket), for testing in the lobby.
  await expect(label(host).first().locator('.region-label__count')).toHaveText(/^(0|1|2–3|4\+)$/);

  // ② Regions: rename inline; the guest sees the new name.
  await host.getByTestId('step-regions').click();
  await host.getByTestId('rename-r2').click();
  await host.getByLabel('Rename Region B').fill('The Quad');
  await host.getByLabel('Rename Region B').press('Enter');
  await expect(label(guest).filter({ hasText: 'The Quad' })).toHaveCount(1);

  // Preview sections: nine labelled sections appear for the selected region.
  await host.getByTestId('preview-sections').check();
  await expect(host.locator('.section-label')).toHaveCount(9);
  await host.getByTestId('preview-sections').uncheck();
  await expect(host.locator('.section-label')).toHaveCount(0);

  // ③ Task points: tapping a point deletes it, tapping the empty map adds one.
  await host.getByTestId('step-points').click();
  await expect(host.locator('.point-marker').first()).toBeVisible();
  const before = await points(host).count();
  await tapNearestPoint(host);
  await expect(points(host)).toHaveCount(before - 1);
  await expect(points(guest)).toHaveCount(before - 1);
  await tapBareMap(host);
  await expect(points(host)).toHaveCount(before);
  await expect(host.locator('.task-point--host')).toHaveCount(1);

  // ⑤ Base: tap to move it.
  await host.getByTestId('step-base').click();
  // Compare x and y: a new Base can land straight above or below the old one.
  const flagAt = () =>
    host.locator('.base-flag').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return `${Math.round(r.x)},${Math.round(r.y)}`;
    });
  const flagBefore = await flagAt();
  await tapBareMap(host);
  await expect.poll(flagAt).not.toBe(flagBefore);
  await expect(guest.locator('.base-flag')).toHaveCount(1);

  // The checklist is green for everything the host controls; only readiness is left.
  await expect(checklist.getByText('Base placed on the map')).toBeVisible();
  for (const text of [
    'Playable area drawn on the map',
    'Base placed on the map',
    'Enough task points',
    'Task points in at least 2 regions',
  ]) {
    await expect(checklist.getByRole('listitem').filter({ hasText: text })).toContainText('(done)');
  }

  for (const page of pages) await page.context().close();
});

test('too few task points block the countdown and say exactly what is missing', async ({
  browser,
}) => {
  const names = ['Ann', 'Bea', 'Cy', 'Di'];
  const pages = await Promise.all(names.map(() => newPlayer(browser)));
  const [host, ...guests] = pages as [Page, ...Page[]];
  const code = await createLobby(host, 'Ann');
  await enableTestMode(host);
  for (const [i, page] of guests.entries()) await joinLobby(page, code, names[i + 1] ?? '');
  await drawCircle(host);
  await expect(label(host)).toHaveCount(2);

  // Delete points until fewer than 4 × 4 = 16 usable ones are left.
  await host.getByTestId('step-points').click();
  await expect(host.getByTestId('points-status')).toContainText('need 16');
  const total = await points(host).count();
  for (let i = 0; i < total - 12; i++) {
    const n = await points(host).count();
    await tapNearestPoint(host);
    await expect(points(host)).toHaveCount(n - 1);
  }
  const checklist = host.getByRole('region', { name: 'Before we start' });
  await expect(
    checklist.getByRole('listitem').filter({ hasText: 'Enough task points' }),
  ).toContainText('(not yet)');

  for (const page of pages) await expect(page.getByTestId('location-ok')).toBeVisible();
  for (const page of pages) await page.getByTestId('ready-button').click();
  await expect(host.getByTestId('countdown')).toBeHidden({ timeout: 2000 });

  // Regenerating restores enough points; everyone was un-readied and can start.
  await host.getByRole('button', { name: 'Regenerate points' }).click();
  await expect(
    checklist.getByRole('listitem').filter({ hasText: 'Enough task points' }),
  ).toContainText('(done)');
  for (const page of pages)
    await expect(page.getByTestId('ready-button')).toHaveAttribute('aria-pressed', 'false');
  for (const page of pages) await page.getByTestId('ready-button').click();
  for (const page of pages) await expect(page.getByTestId('countdown')).toBeVisible();

  for (const page of pages) await page.context().close();
});

test('a no-go zone drawn with the real tool removes the points inside it and can be removed again', async ({
  browser,
}) => {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);
  const code = await createLobby(host, 'Ann');
  await enableTestMode(host);
  await joinLobby(guest, code, 'Bea');
  await drawCircle(host);
  await expect(label(host)).toHaveCount(2);
  const before = await points(host).count();
  await expect(points(guest)).toHaveCount(before);

  // ④ Draw a small rectangle around one task point with Geoman's rectangle tool (two corner clicks).
  // Aim at a real point once the map is still: the middle of the map may hold no point for some
  // layouts (they are seeded by the lobby code), and a map still settling moves the corners.
  await host.getByTestId('step-nogo').click();
  await host.getByTestId('map-frame').scrollIntoViewIfNeeded();
  await waitForMapStill(host);
  await host.locator('.leaflet-pm-icon-rectangle').click();
  const target = await pointNearMiddle(host);
  const a = { x: target.x - RECT_HALF_PX, y: target.y - RECT_HALF_PX };
  const b = { x: target.x + RECT_HALF_PX, y: target.y + RECT_HALF_PX };
  await host.mouse.move(a.x, a.y, { steps: 3 });
  await host.mouse.click(a.x, a.y);
  await host.mouse.move(b.x, b.y, { steps: 5 });
  await host.mouse.click(b.x, b.y);

  await expect(host.locator('path.nogo-zone')).toHaveCount(1);
  await expect(guest.locator('path.nogo-zone')).toHaveCount(1);
  await expect(host.getByText('No-go zone 1')).toBeVisible();
  await expect.poll(() => points(host).count()).toBeLessThan(before);
  await expect(points(guest)).toHaveCount(await points(host).count());

  await host.getByRole('button', { name: 'Remove no-go zone 1' }).click();
  await expect(host.locator('path.nogo-zone')).toHaveCount(0);
  await expect(guest.locator('path.nogo-zone')).toHaveCount(0);

  await host.context().close();
  await guest.context().close();
});

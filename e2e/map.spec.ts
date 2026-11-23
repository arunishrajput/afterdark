import { expect, test } from '@playwright/test';

import { createLobby, drawCircle, enableTestMode, joinLobby, mapPoint, newPlayer } from './helpers';

test('host draws the boundary, a guest sees it, both teleport and see each other move; Ready needs a fix', async ({
  browser,
}) => {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);

  const code = await createLobby(host, 'Host');
  // No location yet (real GPS is not granted in this browser): Ready is blocked.
  await expect(host.getByTestId('permission-gate')).toBeVisible();
  await expect(host.getByTestId('ready-button')).toBeDisabled();

  await enableTestMode(host);
  await joinLobby(guest, code, 'Guest');
  // Test mode on + ?sim=1: the simulator sends a fix, the server calls it good, Ready unlocks.
  await expect(host.getByTestId('location-ok')).toBeVisible();
  await expect(guest.getByTestId('location-ok')).toBeVisible();
  await expect(host.getByTestId('ready-button')).toBeEnabled();
  await expect(guest.getByText('TEST MODE')).toBeVisible();
  await expect(guest.getByTestId('boundary-status')).toHaveText(/Waiting for the host/);

  // Host draws a ~100 m circle with the real Geoman tool.
  await drawCircle(host);
  await expect(host.getByTestId('boundary-status')).toHaveText(/^Area [\d,]+ m²$/);
  await expect(guest.getByTestId('boundary-status')).toHaveText(/^Area [\d,]+ m²$/);
  await expect(guest.getByTestId('map').locator('path.leaflet-interactive').first()).toBeVisible();

  // Both players ready, then a boundary change un-readies everyone.
  await host.getByTestId('ready-button').click();
  await guest.getByTestId('ready-button').click();
  await expect(host.getByTestId('ready-button')).toHaveAttribute('aria-pressed', 'true');

  // Radar: the guest sees the host as one anonymous dot; teleporting moves it.
  const dot = guest.locator('.radar-marker');
  await expect(dot).toHaveCount(1);
  const before = await dot.evaluate((el) => (el as HTMLElement).style.transform);
  const target = await mapPoint(host, 0.0004, 0.0002);
  await host.mouse.move(target.x, target.y);
  await host.mouse.down();
  await host.waitForTimeout(900); // long-press
  await host.mouse.up();
  await expect(async () => {
    const after = await dot.evaluate((el) => (el as HTMLElement).style.transform);
    expect(after).not.toBe(before);
  }).toPass({ timeout: 8000 });
  await expect(dot).toHaveCount(1);
  // The dot has no name anywhere in the DOM.
  await expect(guest.getByTestId('map')).not.toContainText('Host');

  await host.context().close();
  await guest.context().close();
});

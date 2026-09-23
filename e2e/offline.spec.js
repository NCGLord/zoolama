import { test, expect, addItem } from './fixtures.js';
import { readSw } from '../tools/sw-assets.mjs';

const { version, assets } = readSw();

// The one console error this spec causes on purpose: the probe below that proves the network is gone.
test.use({ allowedErrors: [/^Failed to load resource: net::ERR_FAILED$/] });

test('once installed, the app reloads and keeps working with no network', async ({ app: page, context }) => {
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // Install is all-or-nothing: the current version's cache holds every precached file.
  const cached = await page.evaluate(async (name) => (await (await caches.open(name)).keys()).length, `zoolama-${version}`);
  expect(cached).toBe(assets.length);

  await addItem(page, { price: '4,50', name: 'Leite' });
  await context.setOffline(true);
  // The network really is gone: a file that isn't precached can't be fetched.
  const notCached = await page.evaluate(() => fetch('./README.md').then(() => 'fetched', () => 'failed'));
  expect(notCached).toBe('failed');
  const response = await page.reload();
  expect(response.fromServiceWorker()).toBe(true);

  await expect(page.locator('#lines .line')).toHaveCount(1);
  await addItem(page, { price: '8,99', name: 'Café' });
  await expect(page.locator('#lines .line')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Comparar' }).click();
  await expect(page.locator('#options .option')).toHaveCount(2);
});

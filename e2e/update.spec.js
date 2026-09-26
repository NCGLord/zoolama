import { test as base, expect } from './fixtures.js';

// The page's clock is Playwright's, so minutes pass on demand. registration.update() is counted, and the page's
// visibility is flipped by the test, since Playwright can't send a page to the background.
function countUpdateChecks() {
  window.updateChecks = 0;
  const { update } = ServiceWorkerRegistration.prototype;
  ServiceWorkerRegistration.prototype.update = function () {
    window.updateChecks++;
    return update.call(this);
  };
  let visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { get: () => visibility });
  window.setVisibility = (state) => {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  };
}

const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.install();
    await page.addInitScript(countUpdateChecks);
    await use(page);
  },
});

const checks = (page) => page.evaluate(() => window.updateChecks);

test('while open, the app looks for a new version every 7 minutes', async ({ app: page }) => {
  await page.clock.runFor('06:30');
  expect(await checks(page)).toBe(0); // registering has just checked
  await page.clock.runFor('01:00');
  expect(await checks(page)).toBe(1);
  await page.clock.runFor('07:00');
  expect(await checks(page)).toBe(2);
});

test('in the background it never looks; back in front it looks at once if 7 minutes have passed', async ({ app: page }) => {
  await page.evaluate(() => window.setVisibility('hidden'));
  await page.clock.runFor('20:00');
  expect(await checks(page)).toBe(0);
  await page.evaluate(() => window.setVisibility('visible'));
  expect(await checks(page)).toBe(1);
  await page.clock.runFor('06:00');
  expect(await checks(page)).toBe(1); // the one on coming back counts: the next comes 7 to 8 minutes after it
  await page.clock.runFor('02:00');
  expect(await checks(page)).toBe(2);
});

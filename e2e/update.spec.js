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

test('in the background it never looks; back in front it looks at once, every time', async ({ app: page }) => {
  await page.evaluate(() => window.setVisibility('hidden'));
  await page.clock.runFor('20:00');
  expect(await checks(page)).toBe(0);
  await page.evaluate(() => window.setVisibility('visible'));
  expect(await checks(page)).toBe(1);
  await page.evaluate(() => {
    window.setVisibility('hidden');
    window.setVisibility('visible');
  });
  expect(await checks(page)).toBe(2); // coming back looks, however recently it last did
  await page.clock.runFor('06:00');
  expect(await checks(page)).toBe(2);
  await page.clock.runFor('02:00');
  expect(await checks(page)).toBe(3); // while in front: 7 to 8 minutes after the last look
});

// A new version takes over as soon as it has installed; this makes it do so now, as the browser would.
async function takeOver(page) {
  await page.evaluate(() => {
    window.oldPage = true; // gone once the page reloads
    const worker = { postMessage: (_, [port]) => port.postMessage('new000000000') };
    Object.defineProperty(navigator.serviceWorker, 'controller', { get: () => worker });
    navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  });
}
const stillOld = (page) => page.evaluate(() => window.oldPage === true);

test('a new version that arrives before the first touch goes on screen at once', async ({ app: page }) => {
  await Promise.all([page.waitForEvent('load'), takeOver(page)]);
  await expect(page.locator('#toast')).toBeHidden();
});

test('after a touch, a new version waits: Atualizar offers it, and leaving the app puts it on screen', async ({ app: page }) => {
  await page.getByRole('tab', { name: 'Comparar' }).click();
  await takeOver(page);
  await expect(page.locator('#toast-text')).toHaveText('Nova versão disponível');
  expect(await stillOld(page)).toBe(true);
  await Promise.all([page.waitForEvent('load'), page.evaluate(() => window.setVisibility('hidden'))]);
});

test('coming back to the front counts as opening: before the next touch, a new version goes on screen', async ({ app: page }) => {
  await page.getByRole('tab', { name: 'Comparar' }).click();
  await page.evaluate(() => {
    window.setVisibility('hidden');
    window.setVisibility('visible');
  });
  await Promise.all([page.waitForEvent('load'), takeOver(page)]);
});

test('never while an item is half-entered: the new version waits for Atualizar, and nothing is lost', async ({ app: page }) => {
  await page.locator('#price').fill('4,29');
  await page.locator('#price').blur(); // no longer typing, but the item isn't added yet
  await takeOver(page);
  await expect(page.locator('#toast-text')).toHaveText('Nova versão disponível');
  await page.evaluate(() => {
    window.setVisibility('hidden');
    window.setVisibility('visible');
  });
  expect(await stillOld(page)).toBe(true);
  await expect(page.locator('#price')).toHaveValue('4,29');
});

test('asked for, a new version goes on screen as soon as it lands', async ({ app: page }) => {
  await page.evaluate(() =>
    Object.defineProperty(ServiceWorkerRegistration.prototype, 'installing', { get: () => Object.assign(new EventTarget(), { state: 'installing' }) }),
  );
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await page.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(page.locator('#about-update-result')).toHaveText('Nova versão encontrada. Baixando…');
  await Promise.all([page.waitForEvent('load'), takeOver(page)]);
});

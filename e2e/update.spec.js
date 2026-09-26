import { readFileSync } from 'node:fs';
import { test as base, expect } from './fixtures.js';

const VERSION = readFileSync(new URL('../sw.js', import.meta.url), 'utf8').match(/const VERSION = '([^']+)'/)[1];

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

test('a new version that arrives before the first touch goes on screen at once, and says so', async ({ app: page }) => {
  await Promise.all([page.waitForEvent('load'), takeOver(page)]);
  await expect(page.locator('#toast-text')).toHaveText('App atualizado');
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

// The item being entered doesn't hold an update back: it's carried across the reload, photo and offer included.
test('an item half-entered by weight comes back after an update puts the new version on screen', async ({ app: page }) => {
  await page.locator('#entry .entry-mode label', { hasText: 'Peso' }).click();
  await page.locator('#price').fill('7,99');
  await page.locator('#weight').fill('1,250');
  await page.locator('#name').fill('Tomate');
  await page.locator('#name').blur(); // no longer typing, but the item isn't added yet
  await takeOver(page);
  await Promise.all([page.waitForEvent('load'), page.evaluate(() => window.setVisibility('hidden'))]);
  await expect(page.locator('input[name="entry-mode"][value="weight"]')).toBeChecked();
  await expect(page.locator('#price')).toHaveValue('7,99');
  await expect(page.locator('#weight')).toHaveValue('1,250');
  await expect(page.locator('#name')).toHaveValue('Tomate');
  await expect(page.locator('#weight-preview')).toHaveText('= R$ 9,99');
});

test('an item half-entered with its quantity, offer and shelf-tag photo comes back whole', async ({ app: page }) => {
  await page.locator('#price').fill('5,99');
  await page.locator('#entry [data-step="1"]').click();
  await page.locator('#entry-offer').click();
  await page.locator('#deal-min').fill('6');
  await page.locator('#deal-each').fill('4,99');
  await page.locator('#line-form button[type="submit"]').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Fotografar a etiqueta' }).click();
  await (await chooser).setFiles(new URL('../icons/icon-512.png', import.meta.url).pathname);
  await expect(page.locator('#entry-photo-img')).toHaveAttribute('src', /^blob:/);
  await takeOver(page);
  await Promise.all([page.waitForEvent('load'), page.evaluate(() => window.setVisibility('hidden'))]);
  await expect(page.locator('#qty')).toHaveValue('2');
  await expect(page.locator('#entry-deal-text')).toHaveText('A partir de 6: R$ 4,99');
  await expect(page.locator('#entry-photo-img')).toHaveAttribute('src', /^blob:/); // kept, not cleaned up as unused
  await page.locator('#name').fill('Leite');
  await page.locator('#entry button[type="submit"]').click();
  await expect(page.locator('#lines .line-photo img')).toHaveAttribute('src', /^blob:/);
});

// Waiting (the app in use), a new version goes on screen with Atualizar, the toast's or About's; the item being entered
// comes across that reload too.
test('Atualizar puts the new version on screen and brings the half-entered item across', async ({ app: page }) => {
  await page.getByRole('tab', { name: 'Comparar' }).click();
  await page.getByRole('tab', { name: /^Carrinho/ }).click();
  await page.locator('#price').fill('4,29');
  await page.locator('#name').fill('Leite');
  await page.locator('#name').blur();
  await takeOver(page);
  await expect(page.locator('#toast-text')).toHaveText('Nova versão disponível');
  await Promise.all([page.waitForEvent('load'), page.locator('#toast-action').click()]);
  await expect(page.locator('#toast-text')).toHaveText('App atualizado');
  await expect(page.locator('#price')).toHaveValue('4,29');
  await expect(page.locator('#name')).toHaveValue('Leite');
});

test("About's Atualizar puts the waiting version on screen and opens back in About", async ({ app: page }) => {
  await page.getByRole('tab', { name: 'Comparar' }).click(); // in use: a version that lands waits
  await page.locator('#brand-btn').click();
  await takeOver(page);
  await expect(page.locator('#about-update-result')).toHaveText('Nova versão pronta: new000000000');
  await Promise.all([page.waitForEvent('load'), page.locator('#about-update').click()]);
  await expect(page.locator('#panel-about')).toBeVisible();
  await expect(page.locator('#toast-text')).toHaveText('App atualizado');
});

test('never while a field is being typed in: the new version waits, and the typing goes on', async ({ app: page }) => {
  await page.locator('#price').fill('4,29'); // focus stays in the field: typing
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

// The full-screen About (from the logo) is where updates are asked for: it holds nothing a reload could lose, so it
// mustn't hold an update back; and the shopper lands back in About, told it's done.
test('asked for in the full-screen About, a new version goes on screen at once, back in About', async ({ app: page }) => {
  await page.evaluate(() =>
    Object.defineProperty(ServiceWorkerRegistration.prototype, 'installing', { get: () => Object.assign(new EventTarget(), { state: 'installing' }) }),
  );
  await page.locator('#brand-btn').click();
  await page.locator('#about-update').click();
  await expect(page.locator('#about-update-result')).toHaveText('Nova versão encontrada. Baixando…');
  await Promise.all([page.waitForEvent('load'), takeOver(page)]);
  await expect(page.locator('#panel-about')).toBeVisible();
  await expect(page.locator('#toast-text')).toHaveText('App atualizado');
  await expect(page.locator('#about-update-result')).toHaveText(`Atualizado agora para ${VERSION}`); // stays, unlike the toast
});

// The phone's case: a newer version installed and active, but the page never heard it take over (no controllerchange).
// A look must still see that the version on screen is behind the installed one, and put the new one there.
test('a look notices a newer version installed without word of it, and puts it on screen', async ({ app: page }) => {
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await page.evaluate(() => {
    window.oldPage = true;
    const newer = { postMessage: (_, [port]) => port.postMessage('new000000000') };
    Object.defineProperty(ServiceWorkerRegistration.prototype, 'active', { get: () => newer });
  });
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Procurar atualização' }).click()]);
  await expect(page.locator('#panel-about')).toBeVisible();
  await expect(page.locator('#toast-text')).toHaveText('App atualizado');
});

// The log says how a takeover was seen (the event, or a look comparing versions) and when the app left the screen:
// on the phone, that's what tells a missed event from a paused app.
test('the update log tells an event from a look, and when the app went out of sight', async ({ app: page }) => {
  await page.getByRole('tab', { name: 'Comparar' }).click();
  await page.evaluate(() => {
    window.setVisibility('hidden');
    window.setVisibility('visible');
  });
  await Promise.all([page.waitForEvent('load'), takeOver(page)]);
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem('zoolama:update-log')).map(([, e]) => e));
  expect(log).toEqual(expect.arrayContaining(['app hidden', 'app visible', 'controller changed', 'taken over (event)']));
});

// On the phone, four taps on one download logged "download installed" four times: each look watched it again.
test('the update log records each download step once, however often the check is tapped', async ({ app: page }) => {
  await page.evaluate(() => {
    const worker = Object.assign(new EventTarget(), { state: 'installing' });
    window.install = () => {
      worker.state = 'installed';
      worker.dispatchEvent(new Event('statechange'));
    };
    Object.defineProperty(ServiceWorkerRegistration.prototype, 'installing', { get: () => worker });
  });
  await page.getByRole('tab', { name: 'Sobre' }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Procurar atualização' }).click();
    await expect(page.locator('#about-update-result')).toHaveText('Nova versão encontrada. Baixando…');
  }
  await page.evaluate(() => window.install());
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem('zoolama:update-log')).map(([, e]) => e));
  expect(log.filter((e) => e === 'download installed')).toHaveLength(1);
});

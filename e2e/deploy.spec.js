// Real deploys under the running app: a real service worker installing a new version from a server, with nothing
// stubbed. update.spec.js stands the browser's side in for speed, and twice that hid a bug only this could show.
import { test as base, expect } from './fixtures.js';
import { serveSite } from './site-server.js';

// Playwright can't send a page to the background: the test sets visibility, and does so on a reload too. Until it does,
// and while the page unloads, the real one shows through.
function visibility() {
  let forced = null;
  const real = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState').get;
  Object.defineProperty(document, 'visibilityState', { get: () => forced ?? real.call(document), configurable: true });
  addEventListener('pagehide', () => (forced = null), true);
  window.setVisibility = (state) => {
    forced = state;
    document.dispatchEvent(new Event('visibilitychange'));
  };
}

const test = base.extend({
  site: async ({}, use, testInfo) => {
    const site = await serveSite(testInfo.outputPath('site'));
    await use(site);
    await site.close();
  },
  page: async ({ page }, use) => {
    await page.addInitScript(visibility);
    await use(page);
  },
});

/** The app opened from the site and installed: cached, and controlled by its service worker. */
async function installed(page, site) {
  await page.goto(site.url);
  await expect(page.locator('#toast-text')).toHaveAttribute('data-i18n', 'offlineReady');
  await page.reload();
  await expect(page.locator('#toast')).toBeHidden();
  return page.locator('meta[name="version"]').getAttribute('content');
}

/** Which build each module on screen is: {} for the one installed first, then the deploy's name for each. */
const builds = (page) => page.evaluate(() => self.builds ?? {});

test('Procurar atualização finds a deploy, puts it on screen and says so, back in About', async ({ page, site }) => {
  const first = await installed(page, site);
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await expect(page.locator('#about-version')).toHaveText(first);
  await page.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(page.locator('#about-update-result')).toHaveText('Você já tem a versão mais recente.');

  const next = await site.deploy('next');
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Procurar atualização' }).click()]);
  await expect(page.locator('#panel-about')).toBeVisible();
  await expect(page.locator('#toast-text')).toHaveText('App atualizado');
  await expect(page.locator('#about-update-result')).toHaveText(`Atualizado agora para ${next}`);
  await expect(page.locator('#about-version')).toHaveText(next);
  expect(await builds(page)).toMatchObject({ 'src/app.js': 'next', 'src/ui/pwa.js': 'next' });
});

// The page an update's reload brings up, while the browser is already downloading a later version: that download began
// before the page could hear of it, and the browser says nothing more until it ends. Once only a stubbed test watched
// this, and the page said "Atualizado agora" for as long as the download ran.
test('a download under way when an update reloads the page is shown as under way, and then as ready', async ({
  page,
  site,
}) => {
  await installed(page, site);
  await page.locator('#price').fill('4,29'); // typing: a new version waits
  await site.deploy('second');
  await page.evaluate(() => window.setVisibility('visible')); // the app's own look
  await expect(page.locator('#toast-text')).toHaveText('Nova versão disponível');

  const third = await site.deploy('third');
  const download = site.hold('icons/apple-touch-icon-180.png'); // the third's download stops short of its last file
  await page.evaluate(() => window.setVisibility('visible'));
  await download.requested;
  await Promise.all([page.waitForEvent('load'), page.locator('#toast-action').click()]);
  expect(await builds(page)).toMatchObject({ 'src/app.js': 'second' });
  await expect(page.locator('#about-update-result')).toHaveText('Nova versão encontrada. Baixando…');

  await page.getByRole('tab', { name: 'Sobre' }).click(); // touched: the third waits once it lands
  download.release();
  await expect(page.locator('#about-update-result')).toHaveText(`Nova versão pronta: ${third}`);
});

// The update log, every copy's, in time order.
const loggedSteps = (page) =>
  page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('zoolama:update-log'))
      .flatMap((key) => JSON.parse(localStorage.getItem(key)))
      .sort((a, b) => a[0] - b[0])
      .map(([, step]) => step),
  );

/**
 * Installs the version deployed, as the app's look would, from a page of the site's origin that runs no app (the app's
 * own page is held up); resolves once it's active and has taken the app's pages over.
 */
async function installFromOutside(page, site, version) {
  const outside = await page.context().newPage();
  await outside.goto(`${site.origin}/`); // outside the app's scope: no service worker of its own
  const active = () =>
    outside.evaluate(async () => {
      const worker = (await navigator.serviceWorker.getRegistration('/zoolama/'))?.active;
      if (worker?.state !== 'activated') return null;
      const { port1, port2 } = new MessageChannel();
      worker.postMessage('version', [port2]);
      return new Promise((resolve) => (port1.onmessage = (e) => resolve(e.data)));
    });
  await outside.evaluate(async () => (await navigator.serviceWorker.getRegistration('/zoolama/')).update());
  await expect.poll(active).toBe(version);
  await outside.close();
}

// A new version that takes the page over while it's still loading, before the app listens: the browser's word of it
// comes and goes unheard. Seen on a real phone. Here the reload waits at its very start on a request the test holds
// back, while a deploy installs and takes over; let go, the page loads on, the takeover already behind it.
test('a takeover while the page was loading is noticed at start, and the new version put on screen', async ({
  page,
  site,
}) => {
  const first = await installed(page, site);
  const next = await site.deploy('next');
  const gate = site.hold('gate');
  await page.addInitScript(() => {
    if (sessionStorage.getItem('gated')) return; // the reload the test makes, not the app's own
    sessionStorage.setItem('gated', '1');
    const request = new XMLHttpRequest();
    request.open('GET', 'gate', false); // synchronous: the page goes no further until it's answered
    request.send();
  });
  let loads = 0;
  page.on('load', () => loads++);
  const reload = page.reload();
  await gate.requested;
  await installFromOutside(page, site, next);
  gate.release();
  await reload;

  await expect.poll(() => loads).toBe(2); // the test's reload, then the app's own
  await expect(page.locator('meta[name="version"]')).toHaveAttribute('content', next);
  expect(await builds(page)).toMatchObject({ 'src/app.js': 'next', 'src/ui/pwa.js': 'next' });
  expect(await loggedSteps(page)).toEqual(expect.arrayContaining([`start ${first}`, 'taken over (start)', `start ${next}`]));
});

// A CDN midway through a deploy can hand out the new sw.js beside a file of the last version. Installed, that mix would
// be the app until the next update, offline too; so the install is refused, and the next try, once the CDN has caught
// up, goes through.
for (const [stale, what] of [
  ['index.html', 'the page'],
  ['src/money.js', 'a module'],
]) {
  test(`a deploy served with ${what} of the last version is refused, and the next one goes through`, async ({
    page,
    site,
  }) => {
    const first = await installed(page, site);
    await page.getByRole('tab', { name: 'Sobre' }).click();
    await site.deploy('mixed', { stale: [stale] });
    await page.evaluate(() => (window.oldPage = true)); // gone if the page reloads
    await page.getByRole('button', { name: 'Procurar atualização' }).click();
    await expect(page.locator('#about-update-result')).toHaveText('Não foi possível baixar a nova versão. Tente de novo.');
    expect(await page.evaluate(() => window.oldPage)).toBe(true);
    await expect(page.locator('#about-version')).toHaveText(first);

    const next = await site.deploy('next');
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Procurar atualização' }).click()]);
    await expect(page.locator('#about-update-result')).toHaveText(`Atualizado agora para ${next}`);
  });
}

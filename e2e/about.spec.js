import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures.js';

const VERSION = readFileSync(new URL('../sw.js', import.meta.url), 'utf8').match(/const VERSION = '([^']+)'/)[1];

const REPO = 'https://github.com/NCGLord/zoolama';

test('the About tab says what zoolama is, its licence, and where its code and its author are', async ({ app: page }) => {
  await page.getByRole('tab', { name: 'Sobre' }).click();
  const about = page.locator('#panel-about');
  await expect(about).toBeVisible();
  await expect(about.getByRole('img', { name: 'Zoolama' })).toBeVisible();
  await expect(about).toContainText('funciona offline');
  await expect(about).toContainText('licença MIT');
  await expect(about).toContainText('Geraldo Viana');

  const link = (name) => about.getByRole('link', { name });
  await expect(link('Código-fonte no GitHub')).toHaveAttribute('href', REPO);
  await expect(link('Relatar um problema')).toHaveAttribute('href', `${REPO}/issues/new`);
  await expect(link('Texto da licença MIT')).toHaveAttribute('href', `${REPO}/blob/main/LICENSE`);
  await expect(link(/nulaya@gmail\.com/)).toHaveAttribute('href', 'mailto:nulaya@gmail.com');
  for (const a of await about.locator('a[href^="https:"]').all()) {
    await expect(a).toHaveAttribute('target', '_blank');
    await expect(a).toHaveAttribute('rel', 'noopener');
  }

  await page.reload();
  await expect(page.locator('#panel-about')).toBeVisible(); // the tab is remembered, like the others
});

test('About speaks English too', async ({ app: page }) => {
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByRole('tab', { name: 'About' }).click();
  await expect(page.locator('#panel-about').getByRole('link', { name: 'Source code on GitHub' })).toBeVisible();
  await expect(page.locator('#panel-about')).toContainText('MIT licence');
});

test('About shows the version this phone runs, and checks for a newer one on demand', async ({ app: page }) => {
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await expect(page.locator('#about-version')).toHaveText(VERSION);
  await page.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(page.locator('#about-update-result')).toHaveText('Você já tem a versão mais recente.');
});

// On a first visit there's no worker to ask until one has installed and claimed the page.
test('on a first visit, About names the version once the app is ready offline', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await expect(page.locator('#about-version')).toHaveText(VERSION);
});

// A new version takes over as soon as it has installed, but the open app goes on running the code it started with until
// it is reloaded, so About goes on naming that one: "Sobre shows X" has to mean X is what runs.
test('when an update takes over, About keeps naming the version still running until the reload', async ({ app: page }) => {
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await expect(page.locator('#about-version')).toHaveText(VERSION);
  const shown = await page.evaluate(async () => {
    // The new worker takes over, and would answer with its own version if asked.
    const worker = { postMessage: (_, [port]) => port.postMessage('new000000000') };
    Object.defineProperty(navigator.serviceWorker, 'controller', { get: () => worker });
    // active before it claims the page, as a real takeover goes
    Object.defineProperty(ServiceWorkerRegistration.prototype, 'active', { configurable: true, get: () => worker });
    navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
    // Messages arrive in the order they were sent: once this one is in, any answer from the worker has been shown.
    await new Promise((resolve) => {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = resolve;
      port2.postMessage(null);
    });
    return document.getElementById('about-version').textContent;
  });
  expect(shown).toBe(VERSION);
  await expect(page.locator('#toast-text')).toHaveText('Nova versão disponível');
});

// A new version that lands while the app is in use waits to go on screen (see update.spec.js). About says so at once,
// with its number, whatever an earlier check said, and its button becomes the Atualizar that puts it there.
test("a new version waiting to go on screen shows in About at once, and About's Atualizar puts it there", async ({ app: page }) => {
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await page.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(page.locator('#about-update-result')).toHaveText('Você já tem a versão mais recente.');
  await page.evaluate(() => {
    const worker = { postMessage: (_, [port]) => port.postMessage('new000000000') };
    Object.defineProperty(navigator.serviceWorker, 'controller', { get: () => worker });
    // active before it claims the page, as a real takeover goes
    Object.defineProperty(ServiceWorkerRegistration.prototype, 'active', { configurable: true, get: () => worker });
    navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  });
  await expect(page.locator('#about-update-result')).toHaveText('Nova versão pronta: new000000000');
  await expect(page.locator('#about-version')).toHaveText(VERSION); // still what runs
  await expect(page.locator('#about-update')).toHaveText('Atualizar');

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('#about-update-result')).toHaveText('New version ready: new000000000');
  await expect(page.locator('#about-update')).toHaveText('Update');
  await Promise.all([page.waitForEvent('load'), page.locator('#about-update').click()]);
});

// The browser fetches sw.js for an update check itself, out of reach of Playwright's offline mode and routing, and a
// real new version can't be published mid-test; so these make the registration answer the way the browser would.
test('when the check finds a new version, About says it is on its way', async ({ app: page }) => {
  await page.evaluate(() =>
    Object.defineProperty(ServiceWorkerRegistration.prototype, 'installing', { get: () => Object.assign(new EventTarget(), { state: 'installing' }) }),
  );
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await page.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(page.locator('#about-update-result')).toHaveText('Nova versão encontrada. Baixando…');
});

// A page that opens (or reloads into an update) while the next version is already downloading must say so: the
// download started before this page could hear of it, so no updatefound will come.
test('a page opened while a download is under way says the new version is on its way', async ({ app: page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(ServiceWorkerRegistration.prototype, 'installing', { get: () => Object.assign(new EventTarget(), { state: 'installing' }) }),
  );
  await page.reload();
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await expect(page.locator('#about-update-result')).toHaveText('Nova versão encontrada. Baixando…');
});

// A download that doesn't finish (the signal dropped, say) must not leave "Baixando…" on screen for good; and, no
// longer asked for, a later version waits for Atualizar like any other.
test('a download that fails says so, and the next version is not put on screen unasked', async ({ app: page }) => {
  await page.evaluate(() => {
    const worker = Object.assign(new EventTarget(), { state: 'installing' });
    window.failDownload = () => {
      worker.state = 'redundant';
      worker.dispatchEvent(new Event('statechange'));
    };
    Object.defineProperty(ServiceWorkerRegistration.prototype, 'installing', {
      get: () => (worker.state === 'installing' ? worker : null),
    });
  });
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await page.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(page.locator('#about-update-result')).toHaveText('Nova versão encontrada. Baixando…');
  await page.evaluate(() => window.failDownload());
  await expect(page.locator('#about-update-result')).toHaveText('Não foi possível baixar a nova versão. Tente de novo.');
  await expect(page.locator('#about-update')).toHaveText('Procurar atualização');

  await page.evaluate(() => {
    const worker = { postMessage: (_, [port]) => port.postMessage('new000000000') };
    Object.defineProperty(navigator.serviceWorker, 'controller', { get: () => worker });
    // active before it claims the page, as a real takeover goes
    Object.defineProperty(ServiceWorkerRegistration.prototype, 'active', { configurable: true, get: () => worker });
    navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  });
  await expect(page.locator('#about-update-result')).toHaveText('Nova versão pronta: new000000000'); // waiting, not reloaded
});

// About says where updates stand as of the latest look, the app's own looks included: once the signal is back and the
// app has looked by itself, "no signal" gives way.
test("the app's own looks keep About current: with the signal back, the no-signal message goes", async ({ app: page }) => {
  await page.evaluate(() => {
    const { update } = ServiceWorkerRegistration.prototype;
    window.signal = false;
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => window.signal });
    ServiceWorkerRegistration.prototype.update = function () {
      return window.signal ? update.call(this) : Promise.reject(new TypeError('Failed to fetch'));
    };
  });
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await page.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(page.locator('#about-update-result')).toHaveText('Sem conexão. Tente de novo com sinal.');
  await page.evaluate(() => {
    window.signal = true;
    for (const state of ['hidden', 'visible']) {
      // the app goes to the background and comes back, and looks by itself
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      document.dispatchEvent(new Event('visibilitychange'));
    }
  });
  await expect(page.locator('#about-update-result')).toHaveText('Você já tem a versão mais recente.');
});

test('with no signal, the check says so', async ({ app: page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    ServiceWorkerRegistration.prototype.update = () => Promise.reject(new TypeError('Failed to fetch'));
  });
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await page.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(page.locator('#about-update-result')).toHaveText('Sem conexão. Tente de novo com sinal.');
});

// A check can fail with the signal fine: the server answers 404 or 500 for sw.js. Then it's no use asking for signal.
test('a check that fails with the signal fine says it could not check, not that there is no signal', async ({ app: page }) => {
  await page.evaluate(() => {
    ServiceWorkerRegistration.prototype.update = () =>
      Promise.reject(new TypeError('A bad HTTP response code (404) was received when fetching the script.'));
  });
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await page.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(page.locator('#about-update-result')).toHaveText('Não foi possível procurar agora.');
  await expect(page.locator('#about-update')).toBeEnabled();
});

test('About says your data stays on this phone, and how much space zoolama takes on it', async ({ app: page }) => {
  await page.getByRole('tab', { name: 'Sobre' }).click();
  const about = page.locator('#panel-about');
  await expect(about).toContainText('Sem conta e sem rastreamento');
  await expect(page.locator('#about-storage')).toHaveText(/^Usando \d+(,\d)?\u00a0(kB|MB|GB) neste aparelho\.$/);

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('#about-storage')).toHaveText(/^Using \d+(\.\d)?\u00a0(kB|MB|GB) on this phone\.$/);
});

test('About splits that space into the app, the photos and the lists, and says what is left and the memory in use', async ({
  app: page,
}) => {
  await page.getByRole('tab', { name: 'Sobre' }).click();
  const parts = page.locator('#about-storage-parts');
  const sizes = async (size) => {
    for (const part of await parts.locator('dd').all()) await expect(part).toHaveText(new RegExp(`^${size}$`));
  };
  let size = '\\d+(,\\d)?\\u00a0(kB|MB|GB)';
  await expect(parts.locator('dt')).toHaveText(['App, para usar offline', 'Fotos das etiquetas', 'Listas e histórico']);
  await sizes(size);
  await expect(page.locator('#about-storage-free')).toHaveText(new RegExp(`^Ainda cabem ${size}\\.$`));
  // Headless Chromium never agrees to keep a site's data.
  await expect(page.locator('#about-storage-kept')).toHaveText('Sem proteção: se faltar espaço, o aparelho pode apagar estes dados.');
  await expect(page.locator('#about-memory')).toHaveText(new RegExp(`^Memória do JavaScript agora: cerca de ${size}\\.$`));

  await page.getByRole('button', { name: 'English' }).click();
  size = '\\d+(\\.\\d)?\\u00a0(kB|MB|GB)';
  await expect(parts.locator('dt')).toHaveText(['The app, for offline use', 'Shelf-tag photos', 'Lists and history']);
  await sizes(size);
  await expect(page.locator('#about-storage-free')).toHaveText(new RegExp(`^Room for ${size} more\\.$`));
  await expect(page.locator('#about-storage-kept')).toHaveText('Not protected: if space runs low, the phone may clear this data.');
  await expect(page.locator('#about-memory')).toHaveText(new RegExp(`^JavaScript memory now: about ${size}\\.$`));
});

test('About says when the phone has agreed to keep its data', async ({ app: page }) => {
  await page.evaluate(() => (navigator.storage.persisted = async () => true));
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await expect(page.locator('#about-storage-kept')).toHaveText('Protegido: o aparelho não apaga estes dados para liberar espaço.');
});

test("About leaves out what the browser doesn't say, as on an iPhone", async ({ app: page }) => {
  await page.evaluate(() => {
    navigator.storage.estimate = async () => ({ usage: 421_000 }); // no split, no quota
    navigator.storage.persisted = undefined;
    Object.defineProperty(performance, 'memory', { value: undefined });
  });
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await expect(page.locator('#about-storage')).toHaveText(/^Usando \d+(,\d)?\u00a0(kB|MB|GB) neste aparelho\.$/);
  for (const id of ['about-storage-parts', 'about-storage-free', 'about-storage-kept', 'about-memory']) {
    await expect(page.locator(`#${id}`)).toHaveJSProperty('hidden', true);
  }
});

test.describe('sharing zoolama', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  const appLink = (page) => new URL('./', page.url()).href;

  test("goes through the phone's share sheet, with the app's link", async ({ app: page }) => {
    await page.evaluate(() => {
      navigator.share = async (data) => {
        window.shared = data;
      };
    });
    await page.getByRole('tab', { name: 'Sobre' }).click();
    await page.getByRole('button', { name: 'Compartilhar o Zoolama' }).click();
    await expect.poll(() => page.evaluate(() => window.shared?.text)).toBe(
      `Zoolama: ajudante de supermercado que funciona offline. ${appLink(page)}`,
    );
  });

  test('copies the link where there is no share sheet', async ({ app: page }) => {
    await page.getByRole('tab', { name: 'Sobre' }).click();
    await page.getByRole('button', { name: 'Compartilhar o Zoolama' }).click();
    await expect(page.locator('#toast-text')).toHaveText('Link copiado');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `Zoolama: ajudante de supermercado que funciona offline. ${appLink(page)}`,
    );
  });
});

// A record of what the update machinery did, kept across restarts, to see on the phone where an update stopped.
test('About keeps a log of update steps, across restarts', async ({ app: page }) => {
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await page.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(page.locator('#about-update-result')).toHaveText('Você já tem a versão mais recente.');
  await page.reload();
  await page.locator('#about-log summary').click();
  await expect(page.locator('#about-log pre')).toContainText('look asked');
  await expect(page.locator('#about-log pre')).toContainText('latest');
  await expect(page.locator('#about-log pre')).toContainText(`start ${VERSION}`);
});

// Open, the log keeps up: a step taken while it's on screen shows at once, not on the next opening.
test('the update log, while open, shows each new step as it happens', async ({ app: page }) => {
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await page.locator('#about-log summary').click();
  await expect(page.locator('#about-log pre')).not.toContainText('look asked');
  await page.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(page.locator('#about-log pre')).toContainText('look asked');
  await expect(page.locator('#about-log pre')).toContainText('latest');
});

/** A full log: the 40 steps About keeps, taken an hour ago by another copy of the app. */
const fillLog = (page) =>
  page.evaluate(() => {
    const hourAgo = Date.now() - 3600_000;
    const steps = Array.from({ length: 40 }, (_, i) => [hourAgo + i * 1000, `look own ${i}`]);
    localStorage.setItem('zoolama:update-log:other', JSON.stringify(steps));
  });

/** The open log's box: the rows it shows, whether it scrolls, and where it's scrolled to. */
const logBox = (page) =>
  page.locator('#about-log pre').evaluate((pre) => {
    const style = getComputedStyle(pre);
    const inner = pre.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    return {
      rows: inner / parseFloat(style.lineHeight),
      scrolls: pre.scrollHeight > pre.clientHeight,
      atNewest: pre.scrollHeight - pre.scrollTop - pre.clientHeight < 1,
      top: pre.scrollTop,
    };
  });

// The log keeps 40 steps, near a whole screen of them: a box nine rows tall holds it, opening on the latest.
test('a long update log opens in a box nine rows tall, at its newest step, and scrolls', async ({ app: page }) => {
  await fillLog(page);
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await page.locator('#about-log summary').click();
  await expect(page.locator('#about-log pre')).toContainText('look own 39');
  const box = await logBox(page);
  expect(box.rows).toBeCloseTo(9);
  expect(box).toMatchObject({ scrolls: true, atNewest: true });
});

test('a new step keeps the log at its newest, unless it was scrolled up to read an older one', async ({ app: page }) => {
  await fillLog(page);
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await page.locator('#about-log summary').click();
  const log = page.locator('#about-log pre');
  await page.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(log).toContainText('latest');
  expect(await logBox(page)).toMatchObject({ scrolls: true, atNewest: true });

  await log.evaluate((pre) => (pre.scrollTop = 0));
  await page.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(log).toHaveText(/look asked[\s\S]*look asked/);
  expect((await logBox(page)).top).toBe(0);
});

// The installed app and a browser tab, open at once, each keep their own update log: one log written by both lost
// about half the steps. About shows them merged, in time order.
test('with two copies open, each keeps its own update log, and About shows both', async ({ app: page, context }) => {
  const tab = await context.newPage();
  await tab.goto('./');
  for (const copy of [page, tab]) {
    await copy.getByRole('tab', { name: 'Sobre' }).click();
    await copy.getByRole('button', { name: 'Procurar atualização' }).click();
    await expect(copy.locator('#about-update-result')).toHaveText('Você já tem a versão mais recente.');
  }
  const ownLogs = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('zoolama:update-log:')));
  expect(ownLogs).toHaveLength(2);
  await page.locator('#about-log summary').click();
  await expect(page.locator('#about-log pre')).toHaveText(/look asked[\s\S]*look asked/);
});

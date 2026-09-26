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

// Opening the app fetches a new version by itself, and it takes over at once. Until Atualizar reloads the app, the
// check must say so: "you have the latest", beside the old version's number, reads as if there were no update.
test('when a new version has taken over but not yet reloaded the app, the check says to tap Atualizar', async ({ app: page }) => {
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await page.evaluate(() => {
    const worker = { postMessage: (_, [port]) => port.postMessage('new000000000') };
    Object.defineProperty(navigator.serviceWorker, 'controller', { get: () => worker });
    navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  });
  await expect(page.locator('#toast-text')).toHaveText('Nova versão disponível');
  await page.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(page.locator('#about-update-result')).toHaveText('Nova versão pronta: toque em Atualizar.');
  await expect(page.locator('#about-version')).toHaveText(VERSION);
});

// The browser fetches sw.js for an update check itself, out of reach of Playwright's offline mode and routing, and a
// real new version can't be published mid-test; so these make the registration answer the way the browser would.
test('when the check finds a new version, About says it is on its way', async ({ app: page }) => {
  await page.evaluate(() =>
    Object.defineProperty(ServiceWorkerRegistration.prototype, 'installing', { get: () => ({ state: 'installing' }) }),
  );
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await page.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(page.locator('#about-update-result')).toHaveText('Nova versão encontrada. Baixando…');
});

test('with no signal, the check says so', async ({ app: page }) => {
  await page.evaluate(() => {
    ServiceWorkerRegistration.prototype.update = () => Promise.reject(new TypeError('Failed to fetch'));
  });
  await page.getByRole('tab', { name: 'Sobre' }).click();
  await page.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(page.locator('#about-update-result')).toHaveText('Sem conexão. Tente de novo com sinal.');
});

test('About says your data stays on this phone, and how much space zoolama takes on it', async ({ app: page }) => {
  await page.getByRole('tab', { name: 'Sobre' }).click();
  const about = page.locator('#panel-about');
  await expect(about).toContainText('Sem conta e sem rastreamento');
  await expect(page.locator('#about-storage')).toHaveText(/^Usando \d+(,\d)? (kB|MB|GB) neste aparelho\.$/);

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('#about-storage')).toHaveText(/^Using \d+(\.\d)? (kB|MB|GB) on this phone\.$/);
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

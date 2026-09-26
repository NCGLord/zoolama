import { test, expect } from './fixtures.js';

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

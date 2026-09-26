import { writeFileSync } from 'node:fs';
import { test, expect } from './fixtures.js';

const trip = (id, day, store, name, priceCents) => ({
  id,
  at: new Date(2026, 8, day, 18).getTime(),
  store,
  items: [{ name, priceCents, qty: 1 }],
  totalCents: priceCents,
  units: 1,
});

test.beforeEach(async ({ app: page }) => {
  const trips = [trip('b', 20, 'Extra', 'Café', 899), trip('a', 12, 'Assaí', 'Leite', 450)];
  await page.evaluate((t) => localStorage.setItem('zoolama:v1:history', JSON.stringify(t)), trips);
  await page.reload();
  await page.getByRole('tab', { name: 'Histórico' }).click();
});

async function importFile(page, path) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importar' }).click();
  await (await chooser).setFiles(path);
}

test('exported history comes back after a delete, once, and Undo takes an import back', async ({ page }, info) => {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar histórico' }).click();
  expect((await download).suggestedFilename()).toMatch(/^zoolama-historico-\d{4}-\d{2}-\d{2}\.json$/);
  const file = info.outputPath('backup.json');
  await (await download).saveAs(file);

  await page.locator('.trip', { hasText: 'Assaí' }).locator('summary').click();
  await page.getByRole('button', { name: 'Excluir compra' }).click();
  await expect(page.locator('.trip')).toHaveCount(1);

  await importFile(page, file);
  await expect(page.locator('#toast-text')).toHaveText('Compras importadas');
  await expect(page.locator('.trip')).toHaveCount(2);
  await page.locator('#toast-action').filter({ hasText: 'Desfazer' }).click();
  await expect(page.locator('.trip')).toHaveCount(1);

  await importFile(page, file);
  await expect(page.locator('.trip')).toHaveCount(2);
  await importFile(page, file);
  await expect(page.locator('#toast-text')).toHaveText('Nenhuma compra nova nesse arquivo');
  await expect(page.locator('.trip')).toHaveCount(2);

  await page.reload(); // the import was saved, not just shown
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await expect(page.locator('.trip-store')).toHaveText(['Extra', 'Assaí']);
});

test('a file that is not a Zoolama history is refused and changes nothing', async ({ page }, info) => {
  const file = info.outputPath('other.json');
  writeFileSync(file, JSON.stringify({ hello: 'world' }));
  await importFile(page, file);
  await expect(page.locator('#toast-text')).toHaveText('Esse arquivo não é um histórico do Zoolama');
  await expect(page.locator('.trip')).toHaveCount(2);
});

// What an import used to let in: formatting its date threw at every start, before the app got to its service worker.
test('a stored trip dated beyond what a Date can hold is set aside, and the app still starts', async ({ page }) => {
  await page.evaluate(() => {
    const trips = JSON.parse(localStorage.getItem('zoolama:v1:history'));
    localStorage.setItem('zoolama:v1:history', JSON.stringify([...trips, { ...trips[0], id: 'far', at: 1e300 }]));
  });
  await page.reload();
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await expect(page.locator('.trip-store')).toHaveText(['Extra', 'Assaí']);
  expect(await page.evaluate(() => localStorage.getItem('zoolama:v1:history:corrupt'))).toContain('1e+300');
});

test('with no history there is nothing to export, but a file can still be imported', async ({ page }) => {
  await page.evaluate(() => localStorage.removeItem('zoolama:v1:history'));
  await page.reload();
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await expect(page.getByRole('button', { name: 'Exportar histórico' })).toBeHidden();
  await expect(page.locator('#backup-hint')).toHaveText('Trocou de celular? Importe o histórico que você exportou.');
  await expect(page.getByRole('button', { name: 'Importar' })).toBeVisible();
});

import { test, expect, brl, addItem, line } from './fixtures.js';

// Any image stands in for a camera shot: it is shrunk on a canvas and kept in IndexedDB either way.
const SHOT = new URL('../icons/icon-512.png', import.meta.url).pathname;

async function photograph(page, button) {
  const chooser = page.waitForEvent('filechooser');
  await button.click();
  await (await chooser).setFiles(SHOT);
}

test('a shelf-tag photo goes into the cart with its item and shows at full size', async ({ app: page }) => {
  await photograph(page, page.getByRole('button', { name: 'Fotografar a etiqueta' }));
  await expect(page.locator('#entry-photo-img')).toHaveAttribute('src', /^blob:/);
  await addItem(page, { price: '4,50', name: 'Leite' });
  await expect(page.locator('#entry-photo-img')).toBeHidden(); // the next item starts without one

  const thumb = line(page, 'Leite').getByRole('button', { name: 'Ver foto da etiqueta' });
  await expect(thumb.locator('img')).toHaveAttribute('src', /^blob:/);
  await thumb.click();
  await expect(page.locator('#viewer')).toBeVisible();
  await expect(page.locator('#viewer-title')).toHaveText('Leite');
  await expect(page.locator('#viewer-price')).toHaveAttribute('aria-label', brl('4,50'));
  await expect(page.locator('#viewer-when')).toHaveText(/^Foto de /);

  await page.getByRole('button', { name: 'Remover foto' }).click();
  await expect(page.locator('#viewer')).toBeHidden();
  await expect(page.locator('#toast-text')).toHaveText('Foto removida');
  await expect(line(page, 'Leite').getByRole('button', { name: 'Fotografar a etiqueta' })).toBeVisible();

  await page.locator('#toast-action').filter({ hasText: 'Desfazer' }).click();
  await expect(line(page, 'Leite').getByRole('button', { name: 'Ver foto da etiqueta' }).locator('img')).toHaveAttribute('src', /^blob:/);
});

test('a line can be photographed after it was added, and the photo survives a reload', async ({ app: page }) => {
  await addItem(page, { price: '8,99', name: 'Café' });
  await photograph(page, line(page, 'Café').getByRole('button', { name: 'Fotografar a etiqueta' }));
  await expect(line(page, 'Café').locator('.line-photo img')).toHaveAttribute('src', /^blob:/);
  await page.reload();
  await expect(line(page, 'Café').locator('.line-photo img')).toHaveAttribute('src', /^blob:/);
});

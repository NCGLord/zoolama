import { test, expect, addItem } from './fixtures.js';

test('English switches every view and number format, and survives a reload', async ({ app: page }) => {
  await addItem(page, { price: '4,50', name: 'Leite' });
  await page.getByRole('button', { name: 'English' }).click();

  const english = async () => {
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
    await expect(page.locator('#tab-cart [data-i18n="tabCart"]')).toHaveText('Cart');
    await expect(page.locator('#count')).toHaveText('Items: 1');
    await expect(page.locator('#lines .line-sub')).toHaveText('R$4.50');
    await expect(page.locator('#options .option-title').first()).toHaveText('Option 1');
    await expect(page.locator('#history-empty')).toHaveText('No trips saved yet. Use “Finish trip” in the cart.');
    await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
  };
  await english();
  await page.reload();
  await english();
});

test('an error already on screen switches language too', async ({ app: page }) => {
  await page.locator('#entry button[type="submit"]').click();
  await expect(page.locator('#price-error')).toHaveText('Preço inválido');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('#price-error')).toHaveText('Invalid price');
});

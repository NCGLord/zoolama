import { test, expect, addItem } from './fixtures.js';

test('the Compare shortcut opens Compare, and the query is gone so a reload stays put', async ({ app: page }) => {
  await page.goto('./?tab=compare');
  await expect(page.locator('#panel-compare')).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
  await page.getByRole('tab', { name: /^Carrinho/ }).click();
  await page.reload();
  await expect(page.locator('#panel-cart')).toBeVisible();
});

test('the Checkout shortcut opens the cart in checkout mode', async ({ app: page }) => {
  await addItem(page, { price: '4,50', name: 'Leite' });
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await page.goto('./?check=1');
  await expect(page.locator('#panel-cart')).toBeVisible();
  await expect(page.locator('#check-progress')).toHaveText('0 de 1 conferidos');
});

test('with an empty cart the Checkout shortcut opens the cart to fill', async ({ app: page }) => {
  await page.goto('./?check=1');
  await expect(page.locator('#panel-cart')).toBeVisible();
  await expect(page.locator('#entry')).toBeVisible();
  await expect(page.locator('#check-head')).toBeHidden();
});

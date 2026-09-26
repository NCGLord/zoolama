import { test, expect, addItem, line } from './fixtures.js';

// The same app open twice (the installed app and a browser tab, say) shares one storage. Each copy must take up what
// the other saves: otherwise it shows what's out of date, and its next save wipes out the other's work.
test('the app open twice stays one: what either copy saves shows in the other, and nothing is saved over', async ({ app: page, context }) => {
  const other = await context.newPage();
  const errors = [];
  other.on('pageerror', (e) => errors.push(e.message));
  await other.goto('./');

  await addItem(page, { price: '4,29', name: 'Leite' });
  await expect(line(other, 'Leite')).toHaveCount(1);

  await addItem(other, { price: '18,90', name: 'Café' });
  await expect(line(page, 'Café')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#lines .line')).toHaveCount(2); // Leite survived Café's save

  await page.getByRole('button', { name: 'Finalizar compra' }).click();
  await page.getByRole('button', { name: 'Salvar compra' }).click();
  await expect(other.locator('#lines .line')).toHaveCount(0);
  await other.getByRole('tab', { name: 'Histórico' }).click();
  await expect(other.locator('.trip')).toHaveCount(1);
  await other.getByRole('tab', { name: /^Carrinho/ }).click();
  await expect(page.getByRole('tab', { name: 'Histórico' })).toHaveAttribute('aria-selected', 'false'); // tabs are per copy
  expect(errors).toEqual([]);
});

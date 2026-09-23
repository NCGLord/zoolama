import { test, expect, addItem } from './fixtures.js';

// Share falls back to copying the list where there's no share sheet, as on desktop Chromium.
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const names = (page) => page.locator('#lines .line-name').evaluateAll((els) => els.map((e) => e.value));

test('a budget shows what is left, then how far over the cart is', async ({ app: page }) => {
  await addItem(page, { price: '4,50', name: 'Leite' });
  await page.getByRole('button', { name: '+ Orçamento' }).click();
  await page.locator('#budget-input').fill('20');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.locator('#budget')).toHaveText('Restam R$ 15,50 de R$ 20,00');

  await addItem(page, { price: '20', name: 'Queijo' });
  await expect(page.locator('#budget')).toHaveText('R$ 4,50 acima do orçamento');
  await expect(page.locator('#tally')).toHaveClass(/\bover\b/);
});

test('sorts the cart by name and by value, remembering the choice', async ({ app: page }) => {
  await addItem(page, { price: '5,00', name: 'Banana' });
  await addItem(page, { price: '1,00', name: 'Arroz' });
  await addItem(page, { price: '3,00', name: 'Café' });
  await expect.poll(() => names(page)).toEqual(['Café', 'Arroz', 'Banana']); // newest first

  await page.locator('[data-sort="name"]').click();
  await expect.poll(() => names(page)).toEqual(['Arroz', 'Banana', 'Café']);
  await page.locator('[data-sort="total"]').click();
  await expect.poll(() => names(page)).toEqual(['Banana', 'Café', 'Arroz']);
  await page.locator('[data-sort="total"]').click(); // the active key flips direction
  await expect.poll(() => names(page)).toEqual(['Arroz', 'Café', 'Banana']);
  await page.reload();
  await expect.poll(() => names(page)).toEqual(['Arroz', 'Café', 'Banana']);
});

test('the cart is shared as text', async ({ app: page }) => {
  await addItem(page, { price: '4,50', name: 'Leite', qty: 2 });
  await page.getByRole('button', { name: 'Compartilhar' }).click();
  await expect(page.locator('#toast-text')).toHaveText('Lista copiada');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.replace(/ /g, ' ')).toBe('Zoolama — Carrinho\n- Leite: R$ 4,50 × 2 = R$ 9,00\nTotal: R$ 9,00 — Itens: 2');
});

test('the theme toggle overrides the system and sticks', async ({ app: page }) => {
  await page.locator('#theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('a past trip can be deleted, and Undo puts it back', async ({ app: page }) => {
  await addItem(page, { price: '4,50', name: 'Leite' });
  await page.getByRole('button', { name: 'Finalizar compra' }).click();
  await page.getByRole('button', { name: 'Salvar compra' }).click();
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await page.locator('.trip summary').click();
  await page.getByRole('button', { name: 'Excluir compra' }).click();
  await expect(page.locator('#history-empty')).toBeVisible();
  await expect(page.locator('#toast-text')).toHaveText('Compra excluída');
  await page.locator('#toast-action').filter({ hasText: 'Desfazer' }).click();
  await expect(page.locator('.trip')).toHaveCount(1);
});

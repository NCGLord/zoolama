import { test, expect, addItem, line } from './fixtures.js';

const trip = {
  id: 'a',
  at: new Date(2026, 8, 12, 18).getTime(),
  store: 'Assaí',
  items: [
    { name: 'Leite', priceCents: 429, qty: 2 },
    { name: 'Café', priceCents: 1890, qty: 1 },
    { name: 'Tomate', priceCents: 999, qty: 1, perKgCents: 799, grams: 1250 },
    { name: '', priceCents: 350, qty: 1 },
  ],
  totalCents: 3647,
  units: 5,
};

const chips = (page) => page.locator('#plan-items li').allInnerTexts();

test.beforeEach(async ({ app: page }) => {
  await page.evaluate((t) => localStorage.setItem('zoolama:v1:history', JSON.stringify([t])), trip);
  await page.reload();
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await page.locator('.trip summary').click();
  await page.getByRole('button', { name: 'Comprar de novo' }).click();
  await expect(page.locator('#toast-text')).toHaveText('Itens adicionados à lista');
  await page.getByRole('tab', { name: /^Carrinho/ }).click();
});

test('Comprar de novo lists a past trip\'s items, and a tap on one starts entering it', async ({ page }) => {
  await expect(page.locator('#plan-progress')).toHaveText('0 de 3');
  await expect.poll(() => chips(page)).toEqual(['Leite', 'Café', 'Tomate']);

  await page.getByRole('button', { name: 'Tomate' }).click();
  await expect(page.locator('#name')).toHaveValue('Tomate');
  await expect(page.locator('input[name="entry-mode"][value="weight"]')).toBeChecked(); // last bought by weight
  await expect(page.locator('#price')).toBeFocused();
  await expect(page.locator('#name-hint')).toHaveText(/^Última vez: R\$\s7,99\/kg/);
  await page.locator('#price').fill('7,99');
  await page.locator('#weight').fill('1');
  await page.locator('#entry button[type="submit"]').click();

  await expect(page.locator('#plan-progress')).toHaveText('1 de 3');
  await expect.poll(() => chips(page)).toEqual(['Leite', 'Café', 'Tomate']);
  await expect(page.locator('#plan-items .bought')).toHaveText('Tomate');

  await line(page, 'Tomate').getByRole('button', { name: 'Remover' }).click(); // back on the list to buy
  await expect(page.locator('#plan-progress')).toHaveText('0 de 3');

  await page.getByRole('tab', { name: 'Histórico' }).click();
  await page.getByRole('button', { name: 'Comprar de novo' }).click();
  await expect(page.locator('#toast-text')).toHaveText('Esses itens já estão na lista');
});

test('renaming a cart line strikes a listed item off, or puts it back', async ({ page }) => {
  await addItem(page, { price: '4,29', name: 'Leit' });
  await expect(page.locator('#plan-progress')).toHaveText('0 de 3');

  const name = line(page, 'Leit').locator('.line-name');
  await name.fill('Leite');
  await name.press('Enter');
  await expect(page.locator('#plan-progress')).toHaveText('1 de 3');
  await expect(page.locator('#plan-items .bought')).toHaveText('Leite');

  await name.fill('Pão');
  await name.press('Enter');
  await expect(page.locator('#plan-progress')).toHaveText('0 de 3');
});

test('finishing a trip takes off what it bought and keeps the rest; Undo brings it all back', async ({ page }) => {
  await addItem(page, { price: '4,29', name: 'leite' });
  await page.getByRole('button', { name: 'Finalizar compra' }).click();
  await page.getByRole('button', { name: 'Salvar compra' }).click();
  await expect.poll(() => chips(page)).toEqual(['Café', 'Tomate']);
  await page.locator('#toast-action').filter({ hasText: 'Desfazer' }).click();
  await expect.poll(() => chips(page)).toEqual(['Café', 'Tomate', 'Leite']);
});

test('the list can be cleared with Undo, and it steps aside at the till', async ({ page }) => {
  await page.getByRole('button', { name: 'Limpar lista' }).click();
  await expect(page.locator('#plan')).toBeHidden();
  await expect(page.locator('#toast-text')).toHaveText('Lista limpa');
  await page.locator('#toast-action').filter({ hasText: 'Desfazer' }).click();
  await expect(page.locator('#plan')).toBeVisible();

  await addItem(page, { price: '4,29', name: 'Pão' });
  await page.locator('#start-check').click();
  await expect(page.locator('#plan')).toBeHidden();
});

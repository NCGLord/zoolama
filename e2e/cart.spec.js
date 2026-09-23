import { test, expect, brl, addItem, line } from './fixtures.js';

async function fillCart(page) {
  await addItem(page, { price: '4,50', name: 'Leite' });
  await addItem(page, { price: '8,99', name: 'Café', qty: 2 });
  await addItem(page, { price: '12', name: 'Arroz' });
  await line(page, 'Leite').getByRole('button', { name: 'Mais um' }).click();
}

test('adds up three items and a changed quantity', async ({ app: page }) => {
  await fillCart(page);
  await expect(page.locator('#lines .line')).toHaveCount(3);
  await expect(line(page, 'Leite').locator('.line-sub')).toHaveText('R$ 9,00');
  await expect(page.locator('#total')).toHaveAttribute('aria-label', brl('38,98'));
  await expect(page.locator('#count')).toHaveText('Itens: 5');
  await expect(page.locator('#cart-badge')).toHaveText('5');
  // The list is rebuilt on every change; focus must come back to the button that was tapped.
  await expect(line(page, 'Leite').getByRole('button', { name: 'Mais um' })).toBeFocused();
});

test('the cart survives a reload', async ({ app: page }) => {
  await fillCart(page);
  await page.reload();
  await expect(page.locator('#lines .line')).toHaveCount(3);
  for (const name of ['Leite', 'Café', 'Arroz']) await expect(line(page, name)).toHaveCount(1);
  await expect(page.locator('#total')).toHaveAttribute('aria-label', brl('38,98'));
});

test('Clear empties the cart and Undo brings it back', async ({ app: page }) => {
  await fillCart(page);
  await page.getByRole('button', { name: 'Limpar carrinho' }).click();
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#total')).toHaveAttribute('aria-label', brl('0,00'));
  await expect(page.locator('#toast-text')).toHaveText('Carrinho limpo');

  await page.locator('#toast-action').filter({ hasText: 'Desfazer' }).click();
  await expect(page.locator('#lines .line')).toHaveCount(3);
  await expect(page.locator('#total')).toHaveAttribute('aria-label', brl('38,98'));
  await expect(page.locator('#toast')).toBeHidden();
});

test('an Undo that can no longer undo anything goes away', async ({ app: page }) => {
  await addItem(page, { price: '4,50' });
  await page.getByRole('button', { name: 'Limpar carrinho' }).click();
  await expect(page.locator('#toast-text')).toHaveText('Carrinho limpo');
  await addItem(page, { price: '3,00' });
  await expect(page.locator('#toast')).toBeHidden();
});

test('a weighed item is priced per kg, and its weight can be corrected', async ({ app: page }) => {
  await page.getByRole('radio', { name: 'Peso' }).check();
  await expect(page.locator('#price-label')).toHaveText('Preço por kg');
  await expect(page.locator('.entry-qty')).toBeHidden();
  await page.locator('#price').fill('7,99');
  await page.locator('#weight').fill('1,250');
  await expect(page.locator('#weight-preview')).toHaveText(/^= R\$\s9,99$/);
  await page.locator('#entry button[type="submit"]').click();

  const weighed = page.locator('#lines .line');
  await expect(weighed.locator('.line-each')).toHaveText('R$ 7,99/kg × 1,250 kg');
  await expect(weighed.locator('.line-sub')).toHaveText('R$ 9,99');
  await expect(page.locator('input[name="entry-mode"][value="weight"]')).toBeChecked(); // weighed items come in runs

  await weighed.getByRole('button', { name: 'Corrigir peso: 1,250 kg' }).click();
  await weighed.locator('.weight-input').fill('0,500');
  await weighed.locator('.weight-input').press('Enter');
  await expect(weighed.locator('.line-sub')).toHaveText('R$ 4,00');
  await expect(page.locator('#total')).toHaveAttribute('aria-label', brl('4,00'));
});

test('a mistyped price is corrected on its line; Escape and an invalid price leave it alone', async ({ app: page }) => {
  await addItem(page, { price: '45,00', name: 'Leite', qty: 2 });
  const leite = line(page, 'Leite');
  const correct = async (typed, key = 'Enter') => {
    await leite.getByRole('button', { name: /^Corrigir preço/ }).click();
    const input = leite.locator('.price-input');
    await expect(input).toBeFocused();
    await input.fill(typed);
    await input.press(key);
  };

  await correct('4,50');
  await expect(leite.locator('.line-sub')).toHaveText('R$ 9,00');
  await expect(leite.locator('.line-each')).toHaveText('R$ 4,50 × 2');
  await expect(page.locator('#total')).toHaveAttribute('aria-label', brl('9,00'));

  await correct('1', 'Escape');
  await expect(leite.locator('.line-sub')).toHaveText('R$ 9,00');

  await correct('abc');
  await expect(page.locator('#toast-text')).toHaveText('Preço inválido');
  await expect(leite.locator('.line-sub')).toHaveText('R$ 9,00');
});

test('correcting a weighed line changes its price per kg, not its weight', async ({ app: page }) => {
  await page.getByRole('radio', { name: 'Peso' }).check();
  await page.locator('#price').fill('7,99');
  await page.locator('#weight').fill('1,250');
  await page.locator('#entry button[type="submit"]').click();

  const weighed = page.locator('#lines .line');
  await weighed.getByRole('button', { name: /^Corrigir preço por kg/ }).click();
  await expect(weighed.locator('.price-input')).toHaveValue('7,99');
  await weighed.locator('.price-input').fill('6,99');
  await weighed.locator('.price-input').press('Enter');
  await expect(weighed.locator('.line-each')).toHaveText('R$ 6,99/kg × 1,250 kg');
  await expect(weighed.locator('.line-sub')).toHaveText('R$ 8,74');
});

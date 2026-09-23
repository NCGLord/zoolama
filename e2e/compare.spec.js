import { test, expect, brl } from './fixtures.js';

async function fillOption(page, n, { price, qty, unit }) {
  const card = page.locator('#options .option').nth(n - 1);
  await card.getByLabel('Preço').fill(price);
  await card.getByLabel('Quantidade').fill(qty);
  await card.getByRole('radio', { name: unit, exact: true }).check();
  return card;
}

test.beforeEach(async ({ app: page }) => {
  await page.getByRole('tab', { name: 'Comparar' }).click();
});

test('finds the cheaper pack per kg and adds it to the cart', async ({ page }) => {
  const small = await fillOption(page, 1, { price: '8,99', qty: '1', unit: 'kg' });
  const big = await fillOption(page, 2, { price: '29,90', qty: '5', unit: 'kg' });

  await expect(big).toHaveClass(/\bwinner\b/);
  await expect(big.locator('.verdict')).toHaveText('Mais barato');
  await expect(big.locator('.unit-price .tag-price')).toHaveAttribute('aria-label', brl('5,98'));
  await expect(big.locator('.unit-price .per')).toHaveText('/kg');
  await expect(small.locator('.verdict')).toHaveText('+50,3% mais caro');

  await big.getByRole('button', { name: 'Adicionar ao carrinho' }).click();
  await expect(page.locator('#toast-text')).toHaveText('Adicionado ao carrinho');
  await expect(page.locator('#cart-badge')).toHaveText('1');

  await page.getByRole('tab', { name: /^Carrinho/ }).click();
  const added = page.locator('#lines .line');
  await expect(added.locator('.line-name')).toHaveValue('5 kg');
  await expect(added.locator('.line-sub')).toHaveText('R$ 29,90');
});

test('refuses to compare weight with volume', async ({ page }) => {
  await fillOption(page, 1, { price: '5', qty: '500', unit: 'g' });
  await fillOption(page, 2, { price: '5', qty: '500', unit: 'ml' });
  await expect(page.locator('#compare-msg')).toHaveClass(/\berror\b/);
  await expect(page.locator('#compare-msg')).toHaveText('Não dá para comparar peso, volume e unidade entre si.');
  await expect(page.locator('#options .winner')).toHaveCount(0);
});

test('Add to cart works on the first tap straight after typing a price', async ({ page }) => {
  await fillOption(page, 1, { price: '8,99', qty: '1', unit: 'kg' });
  const big = page.locator('#options .option').nth(1);
  await big.getByLabel('Quantidade').fill('5');
  await big.getByRole('radio', { name: 'kg', exact: true }).check();
  await big.getByLabel('Preço').fill('29,90'); // the price field still has focus when Add is tapped
  await big.getByRole('button', { name: 'Adicionar ao carrinho' }).click();
  await expect(page.locator('#toast-text')).toHaveText('Adicionado ao carrinho');
  await expect(page.locator('#cart-badge')).toHaveText('1');
});

test('a multipack typed with the × key is compared by its total and named the way packs print it', async ({
  page,
}) => {
  const cans = page.locator('#options .option').nth(0);
  await cans.getByLabel('Preço').fill('29,90');
  await cans.getByRole('radio', { name: 'ml', exact: true }).check();
  const qty = cans.getByLabel('Quantidade');
  await qty.fill('12');
  await cans.getByRole('button', { name: /^Pacote/ }).click();
  await expect(qty).toBeFocused(); // the keyboard stays up to type the size
  await page.keyboard.type('350');
  await expect(qty).toHaveValue('12×350');
  await expect(cans.locator('.pack-total')).toHaveText('= 4,2 L');

  const bottle = await fillOption(page, 2, { price: '9,99', qty: '2', unit: 'L' });
  await expect(bottle).toHaveClass(/\bwinner\b/);
  await bottle.getByLabel('Preço').fill('49,90');
  await expect(cans).toHaveClass(/\bwinner\b/);

  await cans.getByRole('button', { name: 'Adicionar ao carrinho' }).click();
  await page.getByRole('tab', { name: /^Carrinho/ }).click();
  await expect(page.locator('#lines .line-name')).toHaveValue('12 × 350 ml');
  await expect(page.locator('#lines .line-sub')).toHaveText('R$ 29,90');
});

import { test, expect, addItem, line } from './fixtures.js';

// A trip from earlier this year (the hint drops the year when it's the current one).
const day = new Date(new Date().getFullYear(), 0, 12, 18).getTime();
const trips = [
  {
    id: 'a',
    at: day,
    store: 'Assaí',
    items: [
      { name: 'Leite', priceCents: 429, qty: 2 },
      { name: 'Tomate', priceCents: 999, qty: 1, perKgCents: 799, grams: 1250 },
    ],
    totalCents: 1857,
    units: 3,
  },
];

test.beforeEach(async ({ app: page }) => {
  await page.evaluate((t) => localStorage.setItem('zoolama:v1:history', JSON.stringify(t)), trips);
  await page.reload();
});

test('typing a name bought before shows what it cost last time, and flags a dearer price', async ({ page }) => {
  await expect(page.locator('#item-names option')).toHaveCount(2);
  await page.locator('#name').fill('leite');
  await expect(page.locator('#name-hint')).toHaveText('Última vez: R$ 4,29 · Assaí, 12/01');
  await page.locator('#price').fill('4,59');
  await expect(page.locator('#name-hint')).toHaveText('Última vez: R$ 4,29 · Assaí, 12/01 · +7% desde a última vez');
  await page.locator('#price').fill('4,29');
  await expect(page.locator('#name-hint')).toHaveText('Última vez: R$ 4,29 · Assaí, 12/01');

  await page.locator('#entry button[type="submit"]').click();
  await expect(page.locator('#name-hint')).toHaveText(''); // the form starts over
});

test('a weighed item is remembered by its price per kg', async ({ page }) => {
  await page.getByRole('radio', { name: 'Peso' }).check();
  await page.locator('#name').fill('Tomate');
  await expect(page.locator('#name-hint')).toHaveText('Última vez: R$ 7,99/kg · Assaí, 12/01');
});

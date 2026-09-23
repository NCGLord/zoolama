import { test, expect } from './fixtures.js';

const now = new Date();
const thisMonth = (day) => new Date(now.getFullYear(), now.getMonth(), day, 12).getTime();
const lastMonth = (day) => new Date(now.getFullYear(), now.getMonth() - 1, day, 12).getTime();
const trip = (id, at, store, totalCents) => ({ id, at, store, items: [], totalCents, units: 1 });
const long = (d) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(d);

test('History sums spending by month and by store', async ({ app: page }) => {
  const trips = [
    trip('a', thisMonth(1), 'Assaí', 10000),
    trip('b', lastMonth(10), 'assai', 20000),
    trip('c', lastMonth(12), '', 3000),
    trip('d', lastMonth(15), 'Extra', 5000),
  ];
  await page.evaluate((t) => localStorage.setItem('zoolama:v1:history', JSON.stringify(t)), trips);
  await page.reload();
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await page.getByText('Resumo', { exact: true }).click();

  const bars = page.locator('#month-bars button');
  await expect(bars).toHaveCount(6);
  await expect(bars.last()).toHaveAttribute('aria-pressed', 'true'); // this month to start with
  await expect(page.locator('#month-value')).toHaveText(`${long(now)}: R$ 100,00 · Compras: 1`);

  await bars.nth(4).click();
  await expect(bars.nth(4)).toHaveAttribute('aria-pressed', 'true');
  await expect(bars.nth(4)).toBeFocused();
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  await expect(page.locator('#month-value')).toHaveText(`${long(previous)}: R$ 280,00 · Compras: 3`);

  await expect(page.locator('#avg-trip')).toHaveText('Média por compra: R$ 95,00');
  await expect(page.locator('#store-stats .store-name')).toHaveText(['Assaí', 'Extra', 'Sem loja']);
  await expect(page.locator('#store-stats li').first()).toContainText('Compras: 2 · média R$ 150,00');
});

test('the summary only appears once there are two trips to sum', async ({ app: page }) => {
  await page.evaluate((t) => localStorage.setItem('zoolama:v1:history', JSON.stringify(t)), [trip('a', thisMonth(1), '', 100)]);
  await page.reload();
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await expect(page.locator('#insights')).toBeHidden();
});

import { test, expect } from './fixtures.js';

// Saved data can be half-written, hand-edited or from another version. A bad field must fall back to its default,
// never blank the app in the middle of a shop.
test('boots with every view working when the saved state has the wrong shape', async ({ app: page }) => {
  await page.evaluate(() =>
    localStorage.setItem(
      'zoolama:v1',
      JSON.stringify({
        schema: 1,
        cart: { items: [{ id: 1, name: 'Leite', priceCents: 450, qty: 2 }, { id: 2, priceCents: 'x' }], nextId: 2 },
        compare: { options: 5 },
        sort: { key: 'price', dir: 'sideways' },
        lang: 'fr',
        tab: 'nowhere',
      }),
    ),
  );
  await page.reload();
  await expect(page.locator('#lines .line')).toHaveCount(1);
  await expect(page.locator('#lines .line-sub')).toHaveText('R$ 9,00');
  await page.getByRole('tab', { name: 'Comparar' }).click();
  await expect(page.locator('#options .option')).toHaveCount(2);
});

test('a malformed past trip is set aside and the others still show', async ({ app: page }) => {
  await page.evaluate(() =>
    localStorage.setItem(
      'zoolama:v1:history',
      JSON.stringify([
        {
          id: 'a',
          at: Date.UTC(2026, 8, 20, 15),
          store: 'Assaí',
          items: [{ name: 'Leite', priceCents: 450, qty: 1 }],
          totalCents: 450,
          units: 1,
        },
        { id: 'b', at: 'yesterday', store: 'Extra' },
      ]),
    ),
  );
  await page.reload();
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await expect(page.locator('.trip')).toHaveCount(1);
  await expect(page.locator('.trip-store')).toHaveText('Assaí');
  // The raw value is kept for recovery, not silently overwritten.
  const backup = await page.evaluate(() => localStorage.getItem('zoolama:v1:history:corrupt'));
  expect(backup).toContain('"yesterday"');
});

import { test, expect } from './fixtures.js';

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

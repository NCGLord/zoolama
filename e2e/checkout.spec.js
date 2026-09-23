import { test, expect, addItem } from './fixtures.js';

// In checkout mode a line's name is text, not an input.
const checkLine = (page, name) =>
  page.locator('#lines .line').filter({ has: page.locator('.line-name', { hasText: name }) });

async function chargeLine(page, name, amount) {
  await checkLine(page, name).getByRole('button', { name: 'O caixa cobrou outro valor' }).click();
  const input = checkLine(page, name).locator('.charge-input');
  await input.fill(amount);
  await input.press('Enter'); // blurs; the field saves when it loses focus
}

test('ticks lines at the till and totals what the till charged differently', async ({ app: page }) => {
  await addItem(page, { price: '4,50', name: 'Leite' });
  await addItem(page, { price: '8,99', name: 'Café' });
  await addItem(page, { price: '12,00', name: 'Arroz' });
  await page.locator('#start-check').click();

  await expect(page.locator('#entry')).toBeHidden();
  await expect(page.locator('#check-progress')).toHaveText('0 de 3 conferidos');

  const tick = checkLine(page, 'Leite').getByRole('button', { name: 'Conferido' });
  await tick.click();
  await expect(tick).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#check-progress')).toHaveText('1 de 3 conferidos');

  await chargeLine(page, 'Café', '10,00');
  await expect(checkLine(page, 'Café').locator('.line-charged')).toHaveText('cobrado R$ 10,00+R$ 1,01');
  await expect(page.locator('#check-over')).toHaveText('Cobrado a mais: R$ 1,01');
  await expect(page.locator('#check-law')).toBeVisible();
  await expect(page.locator('#check-progress')).toHaveText('2 de 3 conferidos'); // a charged line counts as checked

  await chargeLine(page, 'Arroz', '11,00');
  await expect(page.locator('#check-favor')).toHaveText('A seu favor: R$ 1,00');

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.locator('#check-summary')).toBeHidden();
  await expect(page.locator('#entry')).toBeVisible();
});

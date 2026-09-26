import { test, expect, brl, addItem } from './fixtures.js';

// Motion on: finishing a trip within budget throws price tags and the total counts down, and neither may break it.
test.use({ reducedMotion: 'no-preference' });

test('finishing a trip saves it to History, and Undo brings the cart back', async ({ app: page }) => {
  await addItem(page, { price: '4,50', name: 'Leite' });
  await addItem(page, { price: '8,99', name: 'Café' });

  await page.getByRole('button', { name: 'Finalizar compra' }).click();
  await expect(page.locator('#finish-total')).toHaveAttribute('aria-label', brl('13,49'));
  await expect(page.locator('#finish-count')).toHaveText('Itens: 2');
  await page.locator('#finish-store').fill('Assaí');
  await page.getByRole('button', { name: 'Salvar compra' }).click();

  await expect(page.locator('#toast-text')).toHaveText('Compra salva');
  await expect(page.locator('#empty')).toBeVisible();

  await page.getByRole('tab', { name: 'Histórico' }).click();
  const trip = page.locator('.trip');
  await expect(trip).toHaveCount(1);
  await expect(trip.locator('.trip-store')).toHaveText('Assaí');
  await expect(trip.locator('.trip-total')).toHaveText('R$ 13,49');
  await expect(page.locator('.month-total')).toHaveText('R$ 13,49');

  await page.locator('#toast-action').filter({ hasText: 'Desfazer' }).click();
  await expect(page.locator('#history-empty')).toBeVisible();
  await page.getByRole('tab', { name: /^Carrinho/ }).click();
  await expect(page.locator('#lines .line')).toHaveCount(2);
  await expect(page.locator('#total')).toHaveAttribute('aria-label', brl('13,49'));
});

// History draws each trip as its heading only; a trip's lines are built the first time it's opened, so years of trips
// don't slow the app's start.
test('a past trip shows its lines once opened, and stays open when History is redrawn', async ({ app: page }) => {
  await addItem(page, { price: '4,50', name: 'Leite', qty: 2 });
  await addItem(page, { price: '8,99', name: 'Café' });
  await page.getByRole('button', { name: 'Finalizar compra' }).click();
  await page.getByRole('button', { name: 'Salvar compra' }).click();
  await page.getByRole('tab', { name: 'Histórico' }).click();

  const trip = page.locator('.trip');
  await expect(trip.locator('.trip-items li')).toHaveCount(0);
  await trip.locator('summary').click();
  await expect(trip.locator('.trip-items .each')).toHaveText([/4,50 × 2$/, /8,99 × 1$/]);
  await expect(trip.getByRole('button', { name: 'Comprar de novo' })).toBeVisible();

  await page.getByRole('button', { name: 'English' }).click(); // redraws every trip
  await expect(trip).toHaveAttribute('open', '');
  await expect(trip.locator('.trip-items .each')).toHaveText([/4\.50 × 2$/, /8\.99 × 1$/]);
});

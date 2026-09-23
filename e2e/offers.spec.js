import { test, expect, brl, line } from './fixtures.js';

const offerSheet = (page) => page.locator('#line-sheet');

async function fillOffer(page, from, each) {
  await page.getByLabel('A partir de (un)').fill(from);
  await page.getByLabel('Preço cada').fill(each);
  await offerSheet(page).getByRole('button', { name: 'Salvar' }).click();
}

test('an atacado price noted while adding applies from its quantity, and the nudge takes you there', async ({
  app: page,
}) => {
  await page.getByRole('button', { name: 'Preço de atacado' }).click();
  await expect(page.locator('#line-sheet-title')).toHaveText('Preço de atacado');
  await expect(page.locator('#price-row')).toBeHidden(); // the price is the entry form's
  await fillOffer(page, '6', '4,99');
  await expect(page.locator('#entry-deal-text')).toHaveText('A partir de 6: R$ 4,99');

  await page.locator('#price').fill('5,99');
  await page.locator('#name').fill('Café');
  for (let i = 1; i < 4; i++) await page.locator('#entry [data-step="1"]').click();
  await page.locator('#entry button[type="submit"]').click();
  await expect(page.locator('#entry-deal')).toBeHidden(); // the next item starts without one

  const cafe = line(page, 'Café');
  await expect(cafe.locator('.line-each')).toHaveText('R$ 5,99 × 4');
  await expect(cafe.locator('.tier-nudge')).toHaveText('Levando 6: R$ 4,99 cada, economiza R$ 6,00');
  await cafe.locator('.tier-nudge').click();
  await expect(cafe.locator('.line-each')).toHaveText('R$ 4,99 × 6 (atacado)');
  await expect(cafe.locator('.line-sub')).toHaveText('R$ 29,94');
  await expect(cafe.locator('.tier-nudge')).toHaveCount(0);
  await expect(page.locator('#total')).toHaveAttribute('aria-label', brl('29,94'));
});

test('an offer can be added to a line, says when more costs less, and can be removed with Undo', async ({
  app: page,
}) => {
  await page.locator('#price').fill('5,99');
  await page.locator('#name').fill('Leite');
  for (let i = 1; i < 5; i++) await page.locator('#entry [data-step="1"]').click();
  await page.locator('#entry button[type="submit"]').click();
  const leite = line(page, 'Leite');

  await leite.getByRole('button', { name: /^Corrigir preço/ }).click();
  await expect(page.locator('#deal-remove')).toBeHidden();
  await fillOffer(page, '6', '4,99');
  await expect(leite.locator('.tier-nudge')).toHaveText('Levando 6 sai mais barato: R$ 29,94'); // 5 × 5,99 = 29,95

  await leite.getByRole('button', { name: /^Corrigir preço/ }).click();
  await expect(page.getByLabel('A partir de (un)')).toHaveValue('6');
  await page.locator('#deal-remove').click();
  await expect(offerSheet(page)).toBeHidden();
  await expect(page.locator('#toast-text')).toHaveText('Promoção removida');
  await expect(leite.locator('.tier-nudge')).toHaveCount(0);
  await page.locator('#toast-action').filter({ hasText: 'Desfazer' }).click();
  await expect(leite.locator('.tier-nudge')).toHaveCount(1);
});

test('an offer that is not a lower price from at least 2 units is refused', async ({ app: page }) => {
  await page.locator('#price').fill('5,99');
  await page.locator('#entry button[type="submit"]').click();
  await page.locator('#lines .line').getByRole('button', { name: /^Corrigir preço/ }).click();
  await fillOffer(page, '6', '6,50');
  await expect(page.locator('#line-error')).toHaveText('Promoção inválida: o preço de atacado precisa ser menor, a partir de 2 un');
  await expect(offerSheet(page)).toBeVisible();
  await fillOffer(page, '1', '4,99');
  await expect(page.locator('#line-error')).toHaveText('Promoção inválida: o preço de atacado precisa ser menor, a partir de 2 un');
});

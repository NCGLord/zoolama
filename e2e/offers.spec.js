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
  await page.getByRole('button', { name: 'Promoção' }).click();
  await expect(page.locator('#line-sheet-title')).toHaveText('Promoção');
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
  await expect(page.locator('#line-error')).toHaveText('Promoção inválida: o preço de atacado precisa ser menor, de 2 a 999 un');
  await expect(offerSheet(page)).toBeVisible();
  await fillOffer(page, '1', '4,99');
  await expect(page.locator('#line-error')).toHaveText('Promoção inválida: o preço de atacado precisa ser menor, de 2 a 999 un');
});

test('"leve 3 pague 2" on a line: one more is free, the discount shows, and the till is warned', async ({
  app: page,
}) => {
  await page.locator('#price').fill('3,50');
  await page.locator('#name').fill('Sabonete');
  await page.locator('#entry [data-step="1"]').click();
  await page.locator('#entry button[type="submit"]').click();
  const soap = line(page, 'Sabonete');

  await soap.getByRole('button', { name: /^Corrigir preço/ }).click();
  await page.getByRole('radio', { name: 'Leve e pague' }).check();
  await page.getByLabel('Leve', { exact: true }).fill('3');
  await page.getByLabel('Pague', { exact: true }).fill('2');
  await offerSheet(page).getByRole('button', { name: 'Salvar' }).click();

  await expect(soap.locator('.line-each')).toHaveText('R$ 3,50 × 2');
  await expect(soap.locator('.tier-nudge')).toHaveText('Mais um sai de graça');
  await soap.locator('.tier-nudge').click();
  await expect(soap.locator('.line-each')).toHaveText('R$ 3,50 × 3 − R$ 3,50 (leve 3 pague 2)');
  await expect(soap.locator('.line-sub')).toHaveText('R$ 7,00');

  await page.locator('#start-check').click();
  await expect(page.locator('#lines .line-note')).toHaveText('O desconto pode vir no fim do cupom');
});

test('a "leve e pague" noted while adding applies to the new line, and one that pays for all is refused', async ({
  app: page,
}) => {
  await page.getByRole('button', { name: 'Promoção' }).click();
  await page.getByRole('radio', { name: 'Leve e pague' }).check();
  await page.getByLabel('Leve', { exact: true }).fill('3');
  await page.getByLabel('Pague', { exact: true }).fill('3');
  await offerSheet(page).getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('#line-error')).toHaveText('Promoção inválida: pague menos unidades do que leva, até 999');
  await page.getByLabel('Pague', { exact: true }).fill('2');
  await offerSheet(page).getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('#entry-deal-text')).toHaveText('Leve 3, pague 2');

  await page.locator('#price').fill('3,50');
  for (let i = 1; i < 3; i++) await page.locator('#entry [data-step="1"]').click();
  await page.locator('#entry button[type="submit"]').click();
  await expect(page.locator('#lines .line-sub')).toHaveText('R$ 7,00');
});

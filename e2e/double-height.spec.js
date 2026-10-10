// Altura dupla: the reading text twice as tall at the same width, as a thermal printer's double-height mode prints.
import { test, expect, addItem } from './fixtures.js';

const FONT = 'Zoolama Altura Dupla';
const toggle = (page) => page.getByRole('button', { name: 'Altura dupla' });

/**
 * The font `field` draws in now, and how tall its "H" is for its width: about 1 in an ordinary font, 2 at double height.
 * Measured large, where whole-pixel rounding can't skew it.
 */
const drawn = (field) =>
  field.evaluate(async (el) => {
    const style = getComputedStyle(el);
    const font = `${style.fontStyle} ${style.fontWeight} 100px ${style.fontFamily}`;
    await document.fonts.load(font, 'H');
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = font;
    const h = ctx.measureText('H');
    return { family: style.fontFamily.split(',')[0].replace(/["']/g, ''), tall: h.actualBoundingBoxAscent / h.width };
  });

// Every kind of reading text on screen at once: a cart line, the name being typed, a list chip, a History receipt
// line, a Compare label.
async function readingText(page) {
  await addItem(page, { price: '4,50', name: 'Leite integral' });
  await page.getByRole('button', { name: 'Finalizar compra' }).click();
  await page.getByRole('button', { name: 'Salvar compra' }).click();
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await page.locator('.trip summary').click();
  await page.getByRole('button', { name: 'Comprar de novo' }).click();
  await page.getByRole('tab', { name: /^Carrinho/ }).click();
  await addItem(page, { price: '7,49', name: 'Arroz tipo 1' });
  await page.locator('#name').fill('Pão de açúcar');
  return {
    'a cart line': page.locator('.line-name').first(),
    'the name being typed': page.locator('#name'),
    'a list chip': page.locator('.plan-chip').first(),
    'a History receipt line': page.locator('.trip-item-name').first(),
    'a Compare label': page.locator('.option-label').first(),
  };
}

test('Altura dupla draws the reading text twice as tall as wide, and leaves the rest as it is', async ({ app: page }) => {
  const fields = await readingText(page);
  const others = { 'a button': page.locator('#entry button[type="submit"]'), 'a price': page.locator('.line-sub').first() };
  const before = {};
  for (const [what, field] of Object.entries(others)) before[what] = (await drawn(field)).family;
  const nameHeight = (await page.locator('.line-name').first().boundingBox()).height;

  await toggle(page).click();
  for (const [what, field] of Object.entries(fields)) {
    const { family, tall } = await drawn(field);
    expect(family, what).toBe(FONT);
    expect(tall, what).toBeCloseTo(2, 1);
  }
  for (const [what, field] of Object.entries(others)) expect((await drawn(field)).family, what).toBe(before[what]);
  expect((await page.locator('.line-name').first().boundingBox()).height).toBeGreaterThan(1.4 * nameHeight); // room made
});

test('Altura dupla stays on across a restart, and turns off again', async ({ app: page }) => {
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-double-height', '');

  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('html')).not.toHaveAttribute('data-double-height');
});

test('the Altura dupla switch is named in English too', async ({ app: page }) => {
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: 'Double height' })).toHaveAttribute('aria-pressed', 'false');
});

// The header has room for every tool but one on a narrow phone while the browser offers Install (shell.spec.js holds
// it to fitting): there, until the app is installed, Altura dupla steps aside. Installed, Install is gone and it shows.
test('on a narrow phone, Altura dupla steps aside only while Install is offered', async ({ app: page }) => {
  const install = (shown) => page.evaluate((s) => (document.getElementById('install').hidden = !s), shown);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toggle(page)).toBeVisible();
  await install(true);
  await expect(toggle(page)).toBeHidden();
  await install(false);
  await expect(toggle(page)).toBeVisible();

  await install(true);
  await page.setViewportSize({ width: 412, height: 844 });
  await expect(toggle(page)).toBeVisible();
});

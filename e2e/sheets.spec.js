import { test, expect } from './fixtures.js';

test('a tap on the backdrop closes a sheet like Cancel; a tap on its padding does not', async ({ app: page }) => {
  const sheet = page.locator('#budget-sheet');
  await page.getByRole('button', { name: '+ Orçamento' }).click();
  await expect(sheet).toBeVisible();
  await page.locator('#budget-input').fill('50');

  const box = await sheet.boundingBox();
  await page.touchscreen.tap(box.x + 4, box.y + box.height / 2); // inside, on the sheet's padding
  await expect(sheet).toBeVisible();

  await page.touchscreen.tap(box.x + box.width / 2, box.y - 30); // on the backdrop above it
  await expect(sheet).toBeHidden();
  await expect(page.locator('#budget')).toHaveText('+ Orçamento'); // nothing saved
});

test('dragging from inside a sheet out onto the backdrop keeps it open', async ({ app: page }) => {
  const sheet = page.locator('#budget-sheet');
  await page.getByRole('button', { name: '+ Orçamento' }).click();
  const input = await page.locator('#budget-input').boundingBox();
  const box = await sheet.boundingBox();
  await page.mouse.move(input.x + 5, input.y + input.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 30);
  await page.mouse.up();
  await expect(sheet).toBeVisible();
});

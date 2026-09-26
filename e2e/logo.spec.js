import { test, expect } from './fixtures.js';

const small = (page) => page.locator('.brand .wordmark');
const big = (page) => page.getByRole('dialog', { name: 'Zoolama' }).locator('.wordmark');

/** Every running animation, held at `at`: 'start' or 'end'. */
const holdAnimations = (page, at) =>
  page.evaluate((at) => {
    for (const a of document.getAnimations()) at === 'end' ? a.finish() : (a.pause(), (a.currentTime = 0));
  }, at);

test('tapping the logo shows it large and centred, and a tap or Esc puts it back', async ({ app: page }) => {
  await page.getByRole('button', { name: 'Zoolama' }).click();
  await expect(page.getByRole('dialog', { name: 'Zoolama' })).toBeVisible();
  const box = await big(page).boundingBox();
  expect(box.width).toBeGreaterThan(300);
  expect(Math.abs(box.x + box.width / 2 - 390 / 2)).toBeLessThan(1);
  expect(Math.abs(box.y + box.height / 2 - 844 / 2)).toBeLessThan(1);
  await expect(small(page)).toBeHidden(); // it has lifted off the header

  await page.mouse.click(40, 700);
  await expect(page.getByRole('dialog', { name: 'Zoolama' })).toBeHidden();
  await expect(small(page)).toBeVisible();

  await page.getByRole('button', { name: 'Zoolama' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Zoolama' })).toBeHidden();
  await expect(small(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zoolama' })).toBeFocused();
});

test.describe('with motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('the large logo grows out of the header one, and shrinks back into it', async ({ app: page }) => {
    const header = await small(page).boundingBox();
    await page.getByRole('button', { name: 'Zoolama' }).click();
    await holdAnimations(page, 'start');
    const first = await big(page).boundingBox();
    for (const k of ['x', 'y', 'width', 'height']) expect(Math.abs(first[k] - header[k]), k).toBeLessThan(1);

    await holdAnimations(page, 'end');
    expect((await big(page).boundingBox()).width).toBeGreaterThan(300);

    await page.mouse.click(40, 700);
    await expect(page.getByRole('dialog', { name: 'Zoolama' })).toBeVisible(); // still shrinking
    await holdAnimations(page, 'end');
    await expect(page.getByRole('dialog', { name: 'Zoolama' })).toBeHidden();
    await expect(small(page)).toBeVisible();
  });
});

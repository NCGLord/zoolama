import { test, expect } from './fixtures.js';

// The header logo opens the About page full screen. There is one About content in the page, #about-content: the
// full-screen view borrows it from the Sobre tab and gives it back, so the two can never drift apart.
const small = (page) => page.locator('.brand .wordmark');
const screen = (page) => page.getByRole('dialog', { name: 'Sobre' });
const big = (page) => screen(page).locator('.about-logo .wordmark');
const contents = (page) => page.locator('#about-content');

/** Every running animation, held at `at`: 'start' or 'end'. */
const holdAnimations = (page, at) =>
  page.evaluate((at) => {
    for (const a of document.getAnimations()) at === 'end' ? a.finish() : (a.pause(), (a.currentTime = 0));
  }, at);

test('tapping the logo opens About full screen, the same content as the tab, with the logo large', async ({ app: page }) => {
  await page.getByRole('button', { name: 'Zoolama' }).click();
  await expect(screen(page)).toBeVisible();
  const box = await screen(page).boundingBox();
  expect([box.x, box.y, box.width, box.height]).toEqual([0, 0, 390, 844]);
  await expect(contents(page)).toHaveCount(1);
  await expect(screen(page).locator('#about-content')).toBeVisible(); // borrowed, not copied
  await expect(screen(page).getByRole('link', { name: 'Código-fonte no GitHub' })).toBeVisible();
  const logo = await big(page).boundingBox();
  expect(logo.width).toBeGreaterThan(300);
  expect(Math.abs(logo.x + logo.width / 2 - 390 / 2)).toBeLessThan(1);
  await expect(small(page)).toBeHidden(); // it has lifted off the header

  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(screen(page)).toBeHidden();
  await expect(contents(page)).toHaveCount(1);
  await expect(page.locator('#panel-about #about-content')).toHaveCount(1); // given back
  await expect(small(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zoolama' })).toBeFocused();

  await page.getByRole('button', { name: 'Zoolama' }).click();
  await page.keyboard.press('Escape');
  await expect(screen(page)).toBeHidden();

  await page.getByRole('tab', { name: 'Sobre' }).click();
  await expect(page.locator('#panel-about').getByRole('link', { name: 'Código-fonte no GitHub' })).toBeVisible();
  expect((await page.locator('#panel-about .about-logo .wordmark').boundingBox()).height).toBeLessThan(80);
});

test('in full screen the language flags stay put and switch About; closing gives them back to the header', async ({
  app: page,
}) => {
  const flags = page.locator('.lang');
  const theme = page.locator('#theme');
  const [header, themeBefore] = [await flags.boundingBox(), await theme.boundingBox()];
  await page.getByRole('button', { name: 'Zoolama' }).click();
  await expect(screen(page).locator('.lang')).toBeVisible(); // the header's own switch, borrowed
  await expect(page.locator('[data-lang]')).toHaveCount(2);
  const inside = await flags.boundingBox();
  for (const k of ['x', 'y', 'width', 'height']) expect(Math.abs(inside[k] - header[k]), k).toBeLessThan(1);
  expect(await theme.boundingBox()).toEqual(themeBefore); // the header behind doesn't shift
  expect((await page.getByRole('button', { name: 'Fechar' }).boundingBox()).x).toBeLessThan(40); // ✕ top left

  await screen(page).getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('dialog', { name: 'About' })).toBeVisible();
  await expect(page.locator('#about-view').getByRole('link', { name: 'Source code on GitHub' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(page.locator('#about-view')).toBeHidden();
  await expect(page.locator('.bar-tools .lang')).toHaveCount(1);
  await expect(page.locator('[data-lang]')).toHaveCount(2);
  expect(await flags.boundingBox()).toEqual(header);
  await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('tab', { name: 'About' })).toBeVisible(); // the whole app switched
});

test('a tap inside the full-screen About does not close it', async ({ app: page }) => {
  await page.getByRole('button', { name: 'Zoolama' }).click();
  await screen(page).getByText('Seus dados').click();
  await expect(screen(page)).toBeVisible();
});

test.describe('with motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('the logo grows out of the header into About, and shrinks back, leaving nothing behind', async ({ app: page }) => {
    const header = await small(page).boundingBox();
    await page.getByRole('button', { name: 'Zoolama' }).click();
    await holdAnimations(page, 'start');
    const first = await big(page).boundingBox();
    for (const k of ['x', 'y', 'width', 'height']) expect(Math.abs(first[k] - header[k]), k).toBeLessThan(1);

    await holdAnimations(page, 'end');
    expect((await big(page).boundingBox()).width).toBeGreaterThan(300);

    await page.getByRole('button', { name: 'Fechar' }).click();
    await expect(screen(page)).toBeVisible(); // still shrinking
    await holdAnimations(page, 'end');
    await expect(screen(page)).toBeHidden();
    await expect(page.locator('#panel-about #about-content')).toHaveCount(1);
    // Back in the tab, the content keeps no trace of the animation: no transform, nothing faded.
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await page.getByRole('tab', { name: 'Sobre' }).click();
    await expect(page.locator('#panel-about .about-lede')).toHaveCSS('opacity', '1');
    await expect(page.locator('#panel-about .about-logo .wordmark')).toHaveCSS('transform', 'none');
  });
});

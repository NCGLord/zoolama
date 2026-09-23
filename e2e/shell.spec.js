import { test, expect, addItem } from './fixtures.js';

// The header and the dock (total + tabs) frame the app: only the content between them may move. The page itself must
// never scroll, bounce or be pulled (pull-to-refresh), and the keyboard must shrink the page rather than pan it.
async function frame(page) {
  return page.evaluate(() => {
    const top = document.querySelector('.bar').getBoundingClientRect().top;
    const bottom = document.querySelector('.tabs').getBoundingClientRect().bottom;
    return { top, bottom, height: innerHeight, scrollY };
  });
}

test('the page itself can neither scroll nor be pulled or bounced', async ({ app: page }) => {
  for (let i = 0; i < 12; i++) await addItem(page, { price: `${i + 1},00` });
  const root = await page.evaluate(() => {
    const html = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    return { overflow: html.overflowY, overscroll: html.overscrollBehaviorY, bodyOverscroll: body.overscrollBehaviorY };
  });
  expect(root).toEqual({ overflow: 'hidden', overscroll: 'none', bodyOverscroll: 'none' });

  await page.evaluate(() => window.scrollTo(0, 400));
  await page.locator('main').evaluate((main) => main.scrollTo(0, main.scrollHeight));
  const { top, bottom, height, scrollY } = await frame(page);
  expect({ top, bottom, scrollY }).toEqual({ top: 0, bottom: height, scrollY: 0 });
});

test('the keyboard shrinks the page instead of panning it, so the frame stays in view', async ({ app: page }) => {
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('interactive-widget=resizes-content');

  // What resizes-content does when the keyboard opens: the layout viewport gets shorter.
  for (let i = 0; i < 12; i++) await addItem(page, { price: `${i + 1},00` });
  await page.setViewportSize({ width: 390, height: 470 });
  await page.locator('#price').focus();
  const { top, bottom, height } = await frame(page);
  expect({ top, bottom }).toEqual({ top: 0, bottom: height });
  await expect(page.locator('#price')).toBeInViewport();
});

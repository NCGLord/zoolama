// Shared by every spec. Named so neither `node --test` nor Playwright mistakes it for a test file.
import { test as base, expect } from '@playwright/test';

export { expect };

export const test = base.extend({
  // Regexes for console errors a spec expects; anything else fails the test.
  allowedErrors: [[], { option: true }],

  // Every test fails on a console error or an uncaught exception, including a module that fails to load.
  consoleGuard: [
    async ({ page, allowedErrors }, use) => {
      const errors = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(e.message));
      await use();
      expect(errors.filter((e) => !allowedErrors.some((re) => re.test(e)))).toEqual([]);
    },
    { auto: true },
  ],

  // The app as it is once installed: cached, and controlled by the service worker. The first visit shows a one-off
  // "ready offline" toast; reloading past it keeps it from covering buttons or replacing a later toast mid-test.
  // Always './', never '/': it stays right when the site is served under /zoolama/.
  app: async ({ page }, use) => {
    await page.goto('./');
    await expect(page.locator('#toast-text')).toHaveAttribute('data-i18n', 'offlineReady');
    await page.reload();
    await expect(page.locator('#toast')).toBeHidden();
    await use(page);
  },
});

/** Money as the app shows it in pt-BR: "R$", a no-break space, the amount. */
export const brl = (amount) => new RegExp(`^R\\$\\s${amount.replace(/[.,]/g, '\\$&')}$`);

/** Types a unit item into the entry form and adds it. */
export async function addItem(page, { price, name = '', qty = 1 }) {
  await page.locator('#price').fill(price);
  if (name) await page.locator('#name').fill(name);
  for (let i = 1; i < qty; i++) await page.locator('#entry [data-step="1"]').click();
  await page.locator('#entry button[type="submit"]').click();
}

/** The cart line whose name field holds `name`. */
export const line = (page, name) =>
  page.locator('#lines .line').filter({ has: page.locator(`input.line-name[value="${name}"]`) });

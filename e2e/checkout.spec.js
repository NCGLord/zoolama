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

test('the screen stays on while checking, and the lock comes back after the browser drops it', async ({ app: page }) => {
  // A stand-in Wake Lock API that counts, so the test sees what the app asks for.
  await page.addInitScript(() => {
    const locks = { requested: 0, released: 0, last: null };
    window.__locks = locks;
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        async request(type) {
          if (type !== 'screen') throw new TypeError(type);
          locks.requested++;
          const lock = new EventTarget();
          lock.release = async () => {
            locks.released++;
            lock.dispatchEvent(new Event('release'));
          };
          locks.last = lock;
          return lock;
        },
      },
    });
  });
  await page.reload();
  const locks = () => page.evaluate(() => ({ requested: window.__locks.requested, released: window.__locks.released }));

  await addItem(page, { price: '4,50', name: 'Leite' });
  expect(await locks()).toEqual({ requested: 0, released: 0 });
  await page.locator('#start-check').click();
  await expect.poll(locks).toEqual({ requested: 1, released: 0 });
  await checkLine(page, 'Leite').getByRole('button', { name: 'Conferido' }).click();
  await expect.poll(locks).toEqual({ requested: 1, released: 0 }); // renders don't ask again

  // The browser drops the lock when the page is hidden; coming back asks for it again.
  await page.evaluate(async () => {
    await window.__locks.last.release();
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(locks).toEqual({ requested: 2, released: 1 });

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect.poll(locks).toEqual({ requested: 2, released: 2 });

  // Checkout mode survives a reload, and so does the lock.
  await page.locator('#start-check').click();
  await page.reload();
  await expect.poll(locks).toEqual({ requested: 1, released: 0 });
});

test('tapping the next line straight after typing a charged amount saves the amount and takes the tap', async ({
  app: page,
}) => {
  await addItem(page, { price: '8,99', name: 'Café' });
  await addItem(page, { price: '12,00', name: 'Arroz' });
  await page.locator('#start-check').click();
  await checkLine(page, 'Café').getByRole('button', { name: 'O caixa cobrou outro valor' }).click();
  await checkLine(page, 'Café').locator('.charge-input').fill('10,00'); // no Enter: the next tap blurs it
  await checkLine(page, 'Arroz').getByRole('button', { name: 'Conferido' }).click();
  await expect(checkLine(page, 'Café').locator('.line-charged')).toHaveText('cobrado R$ 10,00+R$ 1,01');
  await expect(checkLine(page, 'Arroz').getByRole('button', { name: 'Conferido' })).toHaveAttribute('aria-pressed', 'true');
});

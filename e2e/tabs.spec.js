import { test, expect } from './fixtures.js';

test('the tab bar works from the keyboard: arrows, Home and End select, and only the selected tab takes Tab', async ({
  app: page,
}) => {
  const tab = (name) => page.getByRole('tab', { name });
  const selected = async (name, panel) => {
    await expect(tab(name)).toHaveAttribute('aria-selected', 'true');
    await expect(tab(name)).toBeFocused();
    await expect(tab(name)).toHaveAttribute('tabindex', '0');
    await expect(page.locator(`#panel-${panel}`)).toBeVisible();
  };

  await expect(tab('Comparar')).toHaveAttribute('tabindex', '-1');
  await tab(/^Carrinho/).focus();
  await page.keyboard.press('ArrowRight');
  await selected('Comparar', 'compare');
  await expect(tab(/^Carrinho/)).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('End');
  await selected('Sobre', 'about');
  await page.keyboard.press('ArrowRight'); // wraps
  await selected(/^Carrinho/, 'cart');
  await page.keyboard.press('ArrowLeft');
  await selected('Sobre', 'about');
  await page.keyboard.press('ArrowLeft');
  await selected('Histórico', 'history');
  await page.keyboard.press('Home');
  await selected(/^Carrinho/, 'cart');
});

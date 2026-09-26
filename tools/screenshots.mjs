// Regenerates the install-sheet screenshots in screenshots/ (listed under "screenshots" in manifest.webmanifest):
// `node tools/screenshots.mjs`. Needs the dev install (`npm ci`, `npx playwright install --only-shell chromium`) and
// ImageMagick with WebP. Each scene is a saved state loaded into the app at phone size, in pt-BR and the dark theme.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('screenshots/', ROOT);
const ORIGIN = 'http://localhost'; // any origin works: every request is answered from the repo below
const VIEWPORT = { width: 390, height: 844 };
const SCALE = 2; // 780×1688: sharp on a phone, and within the 2.3:1 aspect ratio Chrome's install sheet accepts

const cart = (extra = {}) => ({
  items: [
    { id: 1, name: 'Leite 1 L', priceCents: 459, qty: 6 },
    { id: 2, name: 'Café 500 g', priceCents: 1890, qty: 1 },
    { id: 3, name: 'Tomate', priceCents: 999, qty: 1, perKgCents: 799, grams: 1250 },
    { id: 4, name: 'Arroz 5 kg', priceCents: 2790, qty: 1 },
    { id: 5, name: 'Pão de forma', priceCents: 849, qty: 1 },
  ].map((item) => ({ ...item, ...extra[item.id] })),
  nextId: 6,
  undo: null,
});

const SCENES = {
  carrinho: { tab: 'cart', cart: cart(), budgetCents: 15000 },
  comparar: {
    tab: 'compare',
    cart: cart(),
    compare: {
      options: [
        { label: 'Arroz 1 kg', price: '8,99', qty: '1', unit: 'kg' },
        { label: 'Arroz 5 kg', price: '29,90', qty: '5', unit: 'kg' },
      ],
    },
  },
  conferir: {
    tab: 'cart',
    checking: true,
    cart: cart({ 1: { checked: true }, 2: { checked: true, chargedCents: 1990 }, 3: { checked: true } }),
  },
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: SCALE,
  isMobile: true,
  hasTouch: true,
  locale: 'pt-BR',
  colorScheme: 'dark', // the app follows the system theme until the toggle is used
  reducedMotion: 'reduce', // totals drawn at their final value
  serviceWorkers: 'block', // nothing to cache here, and no "ready offline" toast over the picture
});
await context.route(`${ORIGIN}/**`, (route) => {
  const path = new URL(route.request().url()).pathname;
  route.fulfill({ path: fileURLToPath(new URL(`.${path === '/' ? '/index.html' : path}`, ROOT)) });
});

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
const page = await context.newPage();
await page.goto(`${ORIGIN}/`);
for (const [name, scene] of Object.entries(SCENES)) {
  await page.evaluate((state) => localStorage.setItem('zoolama:v1', JSON.stringify({ schema: 1, ...state })), scene);
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  const png = fileURLToPath(new URL(`${name}.png`, OUT));
  await page.screenshot({ path: png });
  execFileSync('magick', [png, '-quality', '82', fileURLToPath(new URL(`${name}.webp`, OUT))]);
  rmSync(png);
  console.log(`screenshots/${name}.webp`);
}
await browser.close();

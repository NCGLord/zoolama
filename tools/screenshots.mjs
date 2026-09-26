// Regenerates the install-sheet screenshots in screenshots/ (listed under "screenshots" in manifest.webmanifest):
// `node tools/screenshots.mjs`. Needs the dev install (`npm ci`, `npx playwright install --only-shell chromium`) and
// ImageMagick with WebP. Each scene is a saved state loaded into the app at phone size, in pt-BR and the dark theme,
// plus what the scene then does on screen (the magnifier scene opens the magnifier and zooms in).
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

// The magnifier's camera, for the shot: a canvas showing a pack's inkjet-printed dates in a 5×7 dot font (drawn from the
// glyphs below, so it looks the same on every machine). It reports a zoom and redraws larger as the magnifier zooms,
// staying sharp the way a phone camera's own zoom does.
function packCamera() {
  const GLYPHS = {
    0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
    3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
    6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
    9: [14, 17, 17, 15, 1, 2, 12], A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
    F: [31, 16, 16, 30, 16, 16, 16], L: [16, 16, 16, 16, 16, 16, 31], V: [17, 17, 17, 17, 17, 10, 4],
    '/': [1, 1, 2, 4, 8, 16, 16], ':': [0, 12, 12, 0, 12, 12, 0], ' ': [0, 0, 0, 0, 0, 0, 0],
  };
  const LINES = ['FAB:14/09/26', 'VAL:14/03/27', 'L:2415B'];
  const DOT = 4.2; // world px between dots
  let seed = 7;
  const jitter = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.6; // inkjet dots land unevenly
  const dots = [];
  LINES.forEach((line, row) => {
    [...line].forEach((ch, col) => {
      GLYPHS[ch].forEach((bits, y) => {
        for (let x = 0; x < 5; x++) {
          if (bits & (16 >> x)) dots.push([(col * 6 + x) * DOT + jitter(), (row * 10 + y) * DOT + jitter()]);
        }
      });
    });
  });

  const W = 1080;
  const H = 1920;
  let zoom = 1;
  function draw(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const light = ctx.createRadialGradient(W * 0.45, H * 0.45, 0, W / 2, H / 2, H * 0.7);
    light.addColorStop(0, '#f6f2e9');
    light.addColorStop(1, '#c9c1b0');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    // The pack's printed box for the dates, and its barcode below.
    ctx.strokeStyle = '#a3262a';
    ctx.lineWidth = 3;
    ctx.strokeRect(-190, -120, 380, 230);
    ctx.fillStyle = '#a3262a';
    ctx.font = '700 17px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FABRICAÇÃO · VALIDADE · LOTE', 0, -92);
    ctx.fillStyle = '#23201c';
    for (let x = -170, i = 0; x < 170; i++) {
      const w = [3, 1, 2, 1, 4, 2, 1, 3][i % 8];
      ctx.fillRect(x, 150, w * 2, 120);
      x += w * 2 + [2, 3, 1, 2][i % 4] * 2;
    }
    // The inkjet dates, a little askew in their box, as printed on the line.
    ctx.rotate(-0.025);
    ctx.translate(-158, -58);
    ctx.fillStyle = 'rgba(28, 30, 40, 0.92)';
    for (const [x, y] of dots) {
      ctx.beginPath();
      ctx.arc(x, y, DOT * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  navigator.mediaDevices.getUserMedia = async () => {
    const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const ctx = canvas.getContext('2d');
    (function frame() {
      draw(ctx);
      requestAnimationFrame(frame);
    })();
    const stream = canvas.captureStream(30);
    const [track] = stream.getVideoTracks();
    track.getCapabilities = () => ({ zoom: { min: 1, max: 8, step: 0.1 }, torch: true });
    track.applyConstraints = async ({ advanced: [wanted] = [] } = {}) => {
      zoom = wanted.zoom ?? zoom;
      window.cameraZoom = zoom;
    };
    return stream;
  };
}

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
  lupa: {
    tab: 'cart',
    cart: cart(),
    async act(page) {
      await page.locator('#magnifier-btn').click();
      await page.waitForFunction(() => document.getElementById('magnifier-video').readyState >= 2);
      await page.locator('#magnifier-zoom').fill('3');
      await page.waitForFunction(() => window.cameraZoom === 3);
      // Two frames on: the canvas has redrawn at that zoom and the video is showing it.
      await page.evaluate(() => {
        const video = document.getElementById('magnifier-video');
        return new Promise((done) => video.requestVideoFrameCallback(() => video.requestVideoFrameCallback(done)));
      });
    },
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
await page.addInitScript(packCamera);
await page.goto(`${ORIGIN}/`);
for (const [name, { act, ...state }] of Object.entries(SCENES)) {
  await page.evaluate((saved) => localStorage.setItem('zoolama:v1', JSON.stringify({ schema: 1, ...saved })), state);
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  await act?.(page);
  const png = fileURLToPath(new URL(`${name}.png`, OUT));
  await page.screenshot({ path: png });
  execFileSync('magick', [png, '-quality', '82', fileURLToPath(new URL(`${name}.webp`, OUT))]);
  rmSync(png);
  console.log(`screenshots/${name}.webp`);
}
await browser.close();

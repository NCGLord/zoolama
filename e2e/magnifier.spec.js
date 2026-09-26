import { test as base, expect } from './fixtures.js';

// Chromium's fake camera stands in for the phone's. What it reports it can do (zoom, torch) varies by version, so
// getCapabilities is replaced with what each test says the camera offers; getUserMedia and applyConstraints are
// wrapped to record every stream opened and every constraint applied.
function fakeCamera({ zoom, torch, exposure, deny, none }) {
  if (none) {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined });
    return;
  }
  window.cameraLog = { requested: [], streams: [], applied: [] };
  const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    window.cameraLog.requested.push(constraints);
    if (deny) throw new DOMException('Permission denied', 'NotAllowedError');
    const stream = await getUserMedia(constraints);
    window.cameraLog.streams.push(stream);
    return stream;
  };
  const { getCapabilities, applyConstraints } = MediaStreamTrack.prototype;
  MediaStreamTrack.prototype.getCapabilities = function () {
    const { zoom: _z, torch: _t, exposureCompensation: _e, ...caps } = getCapabilities.call(this);
    return {
      ...caps,
      ...(zoom ? { zoom: { min: 1, max: 8, step: 0.1 } } : {}),
      ...(torch ? { torch: true } : {}),
      ...(exposure ? { exposureCompensation: { min: -2, max: 2, step: 1 / 3 } } : {}),
    };
  };
  MediaStreamTrack.prototype.applyConstraints = function (constraints) {
    window.cameraLog.applied.push(constraints);
    return applyConstraints.call(this, constraints);
  };
  // Playwright can't send a page to the background, so tests flip visibilityState themselves.
  let visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { get: () => visibility });
  window.setVisibility = (state) => {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  };
}

const test = base.extend({
  camera: [{ zoom: true, torch: false, exposure: false, deny: false, none: false }, { option: true }],
  page: async ({ page, camera }, use) => {
    await page.addInitScript(fakeCamera, camera);
    await use(page);
  },
});

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

const log = (page) => page.evaluate(() => window.cameraLog);
const zoomsApplied = async (page) => (await log(page)).applied.map((c) => c.advanced?.[0]?.zoom).filter((z) => z !== undefined);
const liveTracks = (page) => page.evaluate(() => window.cameraLog.streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === 'live').length);
const playing = (page) => page.evaluate(() => document.getElementById('magnifier-video').readyState >= 2);

async function openMagnifier(page) {
  await page.getByRole('button', { name: 'Lupa' }).click();
  await expect(page.getByRole('dialog', { name: 'Lupa' })).toBeVisible();
}

test('the magnifier zooms the camera in, and turns it off on close', async ({ app: page }) => {
  await openMagnifier(page);
  await expect.poll(() => playing(page)).toBe(true);
  const [asked] = (await log(page)).requested;
  expect(asked.video).toMatchObject({ facingMode: { ideal: 'environment' }, zoom: true });

  const slider = page.getByRole('slider', { name: 'Zoom' });
  await expect(slider).toHaveAttribute('max', '8');
  await slider.fill('3');
  await expect(page.locator('#magnifier-level')).toHaveText('3,0×');
  await expect(slider).toHaveAttribute('aria-valuetext', '3,0×');
  await expect.poll(async () => (await zoomsApplied(page)).at(-1)).toBe(3);
  expect(await page.locator('#magnifier-video').evaluate((v) => v.style.getPropertyValue('--zoom'))).toBe('');

  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByRole('dialog', { name: 'Lupa' })).toBeHidden();
  await expect.poll(() => liveTracks(page)).toBe(0); // a dialog fires close a task after it hides
});

test('spreading two fingers on the picture zooms in', async ({ app: page }) => {
  await openMagnifier(page);
  await expect.poll(() => playing(page)).toBe(true);
  const view = page.locator('#magnifier-view');
  await view.dispatchEvent('pointerdown', { pointerId: 1, clientX: 150, clientY: 300, isPrimary: true });
  await view.dispatchEvent('pointerdown', { pointerId: 2, clientX: 250, clientY: 300 });
  await view.dispatchEvent('pointermove', { pointerId: 2, clientX: 350, clientY: 300 });
  await expect(page.locator('#magnifier-level')).toHaveText('2,0×'); // the gap went from 100 to 200
  await view.dispatchEvent('pointerup', { pointerId: 2 });
  await view.dispatchEvent('pointermove', { pointerId: 1, clientX: 50, clientY: 300 }); // one finger doesn't zoom
  await expect(page.locator('#magnifier-level')).toHaveText('2,0×');
  await expect.poll(async () => (await zoomsApplied(page)).at(-1)).toBe(2);
});

test('a camera without a torch or exposure control shows neither', async ({ app: page }) => {
  await openMagnifier(page);
  await expect.poll(() => playing(page)).toBe(true);
  await expect(page.getByRole('slider', { name: 'Zoom' })).toBeEnabled();
  await expect(page.locator('#magnifier-torch')).toBeHidden();
  await expect(page.locator('#magnifier-exposure')).toBeHidden();
});

test.describe('on a camera with exposure control', () => {
  test.use({ camera: { zoom: true, exposure: true } });

  const exposureSlider = (page) => page.getByRole('slider', { name: 'Exposição' });
  const lastApplied = async (page) => (await log(page)).applied.at(-1).advanced[0];

  test('exposure brightens or darkens the picture, above the zoom, and goes to the camera with it', async ({ app: page }) => {
    await openMagnifier(page);
    const slider = exposureSlider(page);
    await expect(slider).toBeEnabled();
    await expect(page.locator('#magnifier-exposure-level')).toHaveText('0,0');
    const [ev, zoom] = [await slider.boundingBox(), await page.getByRole('slider', { name: 'Zoom' }).boundingBox()];
    expect(ev.y).toBeLessThan(zoom.y);

    await page.getByRole('slider', { name: 'Zoom' }).fill('2');
    await slider.fill('1');
    await expect(page.locator('#magnifier-exposure-level')).toHaveText('+1,0');
    await expect(slider).toHaveAttribute('aria-valuetext', '+1,0');
    await expect.poll(() => lastApplied(page)).toMatchObject({ exposureCompensation: 1, zoom: 2 });
    await slider.fill('-2');
    await expect(page.locator('#magnifier-exposure-level')).toHaveText('−2,0');
    await expect.poll(() => lastApplied(page)).toMatchObject({ exposureCompensation: -2, zoom: 2 });
  });

  test('the exposure and zoom icons share a column, so the two sliders line up', async ({ app: page }) => {
    await openMagnifier(page);
    await expect(exposureSlider(page)).toBeEnabled();
    const [ev, zoom] = [await exposureSlider(page).boundingBox(), await page.getByRole('slider', { name: 'Zoom' }).boundingBox()];
    expect(Math.abs(ev.x - zoom.x)).toBeLessThan(1);
    expect(Math.abs(ev.width - zoom.width)).toBeLessThan(1);
  });

  test('exposure starts at 0 on each opening, keeps its value on coming back, and waits while frozen', async ({ app: page }) => {
    await openMagnifier(page);
    const slider = exposureSlider(page);
    await slider.fill('1');
    await page.evaluate(() => window.setVisibility('hidden'));
    await page.evaluate(() => window.setVisibility('visible'));
    await expect.poll(() => liveTracks(page)).toBe(1);
    await expect(page.locator('#magnifier-exposure-level')).toHaveText('+1,0');
    await expect.poll(() => lastApplied(page)).toMatchObject({ exposureCompensation: 1 });

    await page.getByRole('button', { name: 'Congelar' }).click();
    await expect(slider).toBeDisabled();
    await page.getByRole('button', { name: 'Congelar' }).click();
    await expect(slider).toBeEnabled();

    await page.getByRole('button', { name: 'Fechar' }).click();
    await openMagnifier(page);
    await expect(slider).toBeEnabled();
    await expect(page.locator('#magnifier-exposure-level')).toHaveText('0,0');
  });
});

test.describe('on a camera with a torch', () => {
  test.use({ camera: { zoom: true, torch: true } });

  const torchesApplied = async (page) =>
    (await log(page)).applied.map((c) => c.advanced?.[0]?.torch).filter((t) => t !== undefined);

  test('on a narrow phone the torch sits between Congelar and Fechar, all on one line', async ({ app: page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openMagnifier(page);
    await expect(page.getByRole('slider', { name: 'Zoom' })).toBeEnabled();
    const [freeze, torch, close] = await Promise.all(
      ['Congelar', 'Lanterna', 'Fechar'].map((name) => page.getByRole('button', { name }).boundingBox()),
    );
    const middle = (box) => box.y + box.height / 2;
    expect(Math.abs(middle(torch) - middle(freeze))).toBeLessThan(4);
    expect(Math.abs(middle(close) - middle(freeze))).toBeLessThan(4);
    expect(freeze.x < torch.x && torch.x < close.x).toBe(true);
  });

  test('the torch lights the print and goes off with the magnifier', async ({ app: page }) => {
    await openMagnifier(page);
    const torch = page.getByRole('button', { name: 'Lanterna' });
    await expect(torch).toHaveAttribute('aria-pressed', 'false');
    await torch.click();
    await expect(torch).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await torchesApplied(page)).at(-1)).toBe(true);
    await page.getByRole('slider', { name: 'Zoom' }).fill('2');
    await expect.poll(async () => (await log(page)).applied.at(-1).advanced[0]).toMatchObject({ zoom: 2, torch: true });
    await torch.click();
    await expect(torch).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => (await torchesApplied(page)).at(-1)).toBe(false);

    await torch.click();
    await page.getByRole('button', { name: 'Fechar' }).click();
    await openMagnifier(page);
    await expect(torch).toHaveAttribute('aria-pressed', 'false'); // each opening starts in the dark
  });
});

test('freezing holds the picture still to read it, and every opening starts live', async ({ app: page }) => {
  await openMagnifier(page);
  await expect.poll(() => playing(page)).toBe(true);
  const freeze = page.getByRole('button', { name: 'Congelar' });
  const slider = page.getByRole('slider', { name: 'Zoom' });
  const paused = () => page.locator('#magnifier-video').evaluate((v) => v.paused);

  await freeze.click();
  await expect(freeze).toHaveAttribute('aria-pressed', 'true');
  expect(await paused()).toBe(true);
  await expect(slider).toBeDisabled(); // zooming a held picture would do nothing on a camera that zooms

  await freeze.click();
  await expect(freeze).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(paused).toBe(false);
  await expect(slider).toBeEnabled();

  await freeze.click();
  await page.evaluate(() => window.setVisibility('hidden'));
  await page.evaluate(() => window.setVisibility('visible'));
  await expect.poll(() => liveTracks(page)).toBe(1);
  await expect(freeze).toHaveAttribute('aria-pressed', 'false'); // a new picture after leaving the app
  await expect.poll(paused).toBe(false);

  await freeze.click();
  await page.getByRole('button', { name: 'Fechar' }).click();
  await openMagnifier(page);
  await expect(freeze).toHaveAttribute('aria-pressed', 'false');
  await expect(slider).toBeEnabled();
});

test.describe('on a camera that cannot zoom', () => {
  test.use({ camera: { zoom: false } });

  test('the picture is enlarged on screen instead, up to 4×, and Esc closes it', async ({ app: page }) => {
    await openMagnifier(page);
    await expect.poll(() => playing(page)).toBe(true);
    const slider = page.getByRole('slider', { name: 'Zoom' });
    await expect(slider).toHaveAttribute('max', '4');
    await slider.fill('2.5');
    await expect(page.locator('#magnifier-level')).toHaveText('2,5×');
    expect(await page.locator('#magnifier-video').evaluate((v) => v.style.getPropertyValue('--zoom'))).toBe('2.5');
    expect(await zoomsApplied(page)).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Lupa' })).toBeHidden();
    await expect.poll(() => liveTracks(page)).toBe(0);
  });
});

test('leaving the app turns the camera off, and coming back turns it on at the same zoom', async ({ app: page }) => {
  await openMagnifier(page);
  await expect.poll(() => playing(page)).toBe(true);
  await page.getByRole('slider', { name: 'Zoom' }).fill('4');

  await page.evaluate(() => window.setVisibility('hidden'));
  expect(await liveTracks(page)).toBe(0);

  await page.evaluate(() => window.setVisibility('visible'));
  await expect.poll(() => liveTracks(page)).toBe(1);
  await expect(page.locator('#magnifier-level')).toHaveText('4,0×');
  await expect.poll(async () => (await zoomsApplied(page)).at(-1)).toBe(4);
});

test.describe('when the camera is refused', () => {
  test.use({ camera: { deny: true } });

  test('the magnifier says how to allow it', async ({ app: page }) => {
    await openMagnifier(page);
    await expect(page.getByRole('alert')).toHaveText(/Permita a câmera nas configurações do navegador/);
    await expect(page.getByRole('slider', { name: 'Zoom' })).toBeDisabled();
  });
});

test.describe('where the browser has no camera access', () => {
  test.use({ camera: { none: true } });

  test('there is no magnifier button', async ({ app: page }) => {
    await expect(page.locator('#theme')).toBeVisible();
    await expect(page.locator('#magnifier-btn')).toBeHidden();
  });
});

test('the Lupa shortcut opens the magnifier, and the query is gone so a reload does not', async ({ app: page }) => {
  await page.goto('./?magnifier=1');
  await expect(page.getByRole('dialog', { name: 'Lupa' })).toBeVisible();
  await expect.poll(() => playing(page)).toBe(true);
  expect(new URL(page.url()).search).toBe('');
  await page.reload();
  await expect(page.locator('#theme')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Lupa' })).toBeHidden();
});

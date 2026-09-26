import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { launchState, opensMagnifier } from '../src/launch.js';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
const html = readFileSync(new URL('index.html', root), 'utf8');

test('start_url, scope and id are relative, so the app works under /zoolama/ on GitHub Pages', () => {
  for (const key of ['start_url', 'scope', 'id']) assert.equal(manifest[key], './', key);
});

test('every manifest icon exists on disk', () => {
  for (const { src } of manifest.icons) assert.ok(existsSync(new URL(src, root)), src);
});

test('installability icons are present: 192, 512 and a maskable one', () => {
  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
});

test('index.html links the manifest and the iOS home-screen icon, and they exist', () => {
  for (const href of ['./manifest.webmanifest', './icons/apple-touch-icon-180.png', './icons/icon.svg']) {
    assert.ok(html.includes(`href="${href}"`), `index.html should link ${href}`);
    assert.ok(existsSync(new URL(href, root)), href);
  }
});

// Chrome paints an installed app's Android navigation bar in the manifest theme_color, fixed at install, and reads no
// dark-mode alternative from the manifest. It asks Android for light buttons only when white on that colour reaches a
// 3:1 WCAG contrast (ColorUtils.shouldUseLightForegroundOnBackground in Chromium); below that it asks for dark ones,
// which One UI in dark mode ignores, drawing light buttons anyway. A light theme_color (#f4faef, until 2026-09-25) so
// gave Samsung M51/M52 phones a near-white bar with near-invisible controls. White must reach 3:1 on the bar: then
// Chrome asks for light buttons, and One UI's light ones stay visible too. The status bar is unaffected: it follows
// the app's theme through the page's theme-color metas.
const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Chromium's rule, as in ColorUtils.getContrastForColor: the WCAG contrast of white on the colour is 3 or more. */
const chromeUsesLightButtons = (hex) => 1.05 / (luminance(hex) + 0.05) >= 3;

test('the rule behind the navigation bar test is Chrome\'s: light buttons on dark colours, dark ones on light', () => {
  assert.equal(chromeUsesLightButtons('#0e1a11'), true);
  assert.equal(chromeUsesLightButtons('#f4faef'), false, 'the old theme_color: dark buttons, which One UI overrides');
  assert.equal(chromeUsesLightButtons('#237a3c'), true, 'the lettuce green would do too');
  assert.equal(chromeUsesLightButtons('#ffcf33'), false, 'the mango tag would not');
});

test('the manifest theme colour is dark enough for light navigation-bar buttons, which Samsung phones need', () => {
  assert.match(manifest.theme_color ?? '', /^#[0-9a-f]{6}$/i, 'a theme_color Chrome can paint the bar with');
  assert.ok(chromeUsesLightButtons(manifest.theme_color), `${manifest.theme_color}: white on it is under 3:1`);
});

test('every manifest shortcut opens something the app knows, inside its scope', () => {
  assert.ok(manifest.shortcuts?.length, 'the manifest has shortcuts');
  assert.ok(manifest.shortcuts.length <= 3, 'Chrome for Android shows at most 3');
  for (const { name, url } of manifest.shortcuts) {
    assert.ok(name, 'each shortcut has a name');
    assert.match(url, /^\.\/\?/, `${url} is relative to the scope, like start_url`);
    const cart = { items: [{ id: 1, name: '', priceCents: 450, qty: 1 }], nextId: 2, undo: null };
    const s = { cart, tab: 'history', checking: false };
    const search = new URL(url, 'https://example.test/app/').search;
    assert.ok(launchState(s, search) !== s || opensMagnifier(search), `${url} opens something`);
  }
});

test('a shortcut opens the magnifier, for reading a date straight from the home screen', () => {
  assert.ok(manifest.shortcuts.some(({ url }) => opensMagnifier(new URL(url, 'https://example.test/app/').search)));
});

/** Width and height from a WebP file's header (lossy, lossless or extended). */
function webpSize(file) {
  const b = readFileSync(file);
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  if (chunk === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  throw new Error(`not a WebP file: ${file}`);
}

// Chrome shows these in its install sheet on phones: narrow, labelled, and within its size and ratio limits.
test('every install screenshot exists, is the size the manifest says, and fits Chrome\'s install sheet', () => {
  assert.ok(manifest.screenshots?.length, 'the manifest has screenshots');
  for (const { src, sizes, type, form_factor, label } of manifest.screenshots) {
    assert.equal(form_factor, 'narrow', src);
    assert.equal(type, 'image/webp', src);
    assert.ok(label, `${src} has a label`);
    const [width, height] = webpSize(new URL(src, root));
    assert.equal(sizes, `${width}x${height}`, src);
    assert.ok(Math.min(width, height) >= 320 && Math.max(width, height) <= 3840, `${src}: 320–3840 px`);
    assert.ok(Math.max(width, height) / Math.min(width, height) <= 2.3, `${src}: at most 2.3:1`);
  }
});

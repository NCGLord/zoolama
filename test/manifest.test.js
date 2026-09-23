import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { launchState } from '../src/launch.js';

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

test('every manifest shortcut opens something the app knows, inside its scope', () => {
  assert.ok(manifest.shortcuts?.length, 'the manifest has shortcuts');
  assert.ok(manifest.shortcuts.length <= 3, 'Chrome for Android shows at most 3');
  for (const { name, url } of manifest.shortcuts) {
    assert.ok(name, 'each shortcut has a name');
    assert.match(url, /^\.\/\?/, `${url} is relative to the scope, like start_url`);
    const cart = { items: [{ id: 1, name: '', priceCents: 450, qty: 1 }], nextId: 2, undo: null };
    const s = { cart, tab: 'history', checking: false };
    assert.notEqual(launchState(s, new URL(url, 'https://example.test/app/').search), s, `${url} opens something`);
  }
});

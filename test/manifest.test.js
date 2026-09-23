import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

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

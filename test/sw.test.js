import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { ROOT, readSw, assetsHash } from '../tools/sw-assets.mjs';

const { version, assets } = readSw();
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const refs = (text, re) => [...text.matchAll(re)].map((m) => m[1]);

test('every precached asset exists on disk', () => {
  for (const a of assets) assert.ok(existsSync(new URL(a, ROOT)), a);
});

test('every JS module in src/ is precached', () => {
  for (const f of readdirSync(new URL('src/', ROOT))) assert.ok(assets.includes(`./src/${f}`), `./src/${f}`);
});

test('every local file referenced by index.html, the manifest and the stylesheet is precached', () => {
  const referenced = [
    ...refs(read('index.html'), /(?:href|src)="(\.\/[^"]+)"/g),
    ...JSON.parse(read('manifest.webmanifest')).icons.map((i) => i.src),
    ...refs(read('styles.css'), /url\('(\.\/[^']+)'\)/g),
  ];
  for (const r of referenced) assert.ok(assets.includes(r), `${r} is referenced but not in ASSETS`);
});

test('VERSION matches the hash of the precached files — run `npm run stamp` after changing any asset', () => {
  assert.equal(version, assetsHash(assets));
});

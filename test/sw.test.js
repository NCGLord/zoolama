import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { sep } from 'node:path';
import { PAGE_VERSION_RE, ROOT, readSw, assetsHash } from '../tools/sw-assets.mjs';

const { version, assets } = readSw();
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const refs = (text, re) => [...text.matchAll(re)].map((m) => m[1]);

test('every precached asset exists on disk', () => {
  for (const a of assets) assert.ok(existsSync(new URL(a, ROOT)), a);
});

test('every JS module in src/, subfolders included, is precached', () => {
  const modules = readdirSync(new URL('src/', ROOT), { recursive: true }).filter((f) => f.endsWith('.js'));
  for (const f of modules) {
    const path = `./src/${f.split(sep).join('/')}`;
    assert.ok(assets.includes(path), path);
  }
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

test("index.html carries the same version as sw.js, so a page knows which version it is", () => {
  assert.equal(read('index.html').match(PAGE_VERSION_RE)?.[1], version);
});

// sw.js's install, run as a browser would once it has fetched ASSETS: here they're the repo's files, each but those in
// `served` (name → bytes), as a CDN midway through a deploy can serve. Settles as the install does.
async function install(served = {}) {
  const handlers = {};
  const cached = new Map();
  const cache = {
    addAll: async (requests) => requests.forEach(({ url }) => cached.set(url, served[url] ?? readFileSync(new URL(url, ROOT)))),
    match: async (url) => new Response(cached.get(url)),
  };
  const self = { addEventListener: (type, handler) => (handlers[type] = handler), skipWaiting: async () => {} };
  const context = { self, caches: { open: async () => cache }, Request: class { constructor(url) { this.url = url; } }, Response, Blob, TextEncoder, TextDecoder, crypto: webcrypto };
  vm.runInNewContext(read('sw.js'), context);
  let done;
  handlers.install({ waitUntil: (promise) => (done = promise) });
  return done;
}

test('sw.js installs the files VERSION was stamped from: its hash is the same as `npm run stamp`\'s', async () => {
  await install();
});

test('sw.js refuses to install a version with any one file not the one VERSION was stamped from', async () => {
  for (const a of assets) {
    const bytes = Buffer.from(readFileSync(new URL(a, ROOT)));
    bytes[bytes.length - 1] ^= 1; // the last byte, past the page's version tag
    await assert.rejects(install({ [a]: bytes }), /the files cached are/, a);
  }
});

test('sw.js refuses to install a version whose page carries another version, though the rest of it is the same', async () => {
  const page = read('index.html').replace(PAGE_VERSION_RE, '<meta name="version" content="0123456789ab" />');
  await assert.rejects(install({ './index.html': Buffer.from(page) }), /index\.html isn't/);
});

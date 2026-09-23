import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, readSw, siteFiles, buildSite } from '../tools/sw-assets.mjs';

const { assets } = readSw();
const site = siteFiles();

test('the site is the service worker, everything it precaches, and the font licence', () => {
  assert.ok(site.includes('./sw.js'));
  for (const a of assets) assert.ok(site.includes(a), a);
  assert.ok(site.includes('./fonts/OFL.txt'));
  assert.equal(new Set(site).size, site.length, 'no file listed twice');
});

test('nothing but the app is published: no tests, tools, docs or package files', () => {
  const privateDir = /^\.\/(test|e2e|tools|docs|\.github|node_modules)\//;
  const privateFile = /^\.\/(package(-lock)?\.json|README\.md|playwright\.config\.js)$/;
  for (const f of site) {
    assert.doesNotMatch(f, privateDir);
    assert.doesNotMatch(f, privateFile);
  }
});

test('every service worker the app registers is published', () => {
  const sources = readdirSync(new URL('src/', ROOT), { recursive: true }).filter((f) => f.endsWith('.js'));
  const registered = sources.flatMap((f) => {
    const source = readFileSync(new URL(`src/${f.split(sep).join('/')}`, ROOT), 'utf8');
    return [...source.matchAll(/\.register\('(\.\/[^']+)'\)/g)].map((m) => m[1]);
  });
  assert.ok(registered.length > 0, 'found the registration');
  for (const r of registered) assert.ok(site.includes(r), `${r} is registered but not published`);
});

test('building the site writes exactly those files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zoolama-site-'));
  try {
    buildSite(pathToFileURL(`${dir}/`));
    const written = readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => `./${join(e.parentPath, e.name).slice(dir.length + 1).split(sep).join('/')}`);
    assert.deepEqual(written.sort(), [...site].sort());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

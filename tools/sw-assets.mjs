// Shared by tools/stamp-sw.mjs and test/sw.test.js: reads the precache list out of sw.js and
// hashes the listed files, so VERSION changes whenever any shipped byte changes.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const ROOT = new URL('../', import.meta.url);
export const SW = new URL('sw.js', ROOT);

const ASSETS_RE = /\/\* ASSETS:start \*\/([\s\S]*?)\/\* ASSETS:end \*\//;
export const VERSION_RE = /const VERSION = '([^']*)';/;

export function readSw(source = readFileSync(SW, 'utf8')) {
  return {
    source,
    version: source.match(VERSION_RE)?.[1],
    assets: JSON.parse(source.match(ASSETS_RE)[1]),
  };
}

export function assetsHash(assets) {
  const hash = createHash('sha256');
  for (const a of assets) hash.update(a).update('\0').update(readFileSync(new URL(a, ROOT))).update('\0');
  return hash.digest('hex').slice(0, 12);
}

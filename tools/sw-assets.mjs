// Shared by tools/stamp-sw.mjs, tools/site.mjs and the tests: reads the precache list out of sw.js, hashes the
// listed files (so VERSION changes whenever any shipped byte changes), and builds the published site from it.
import { readFileSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
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

// Published but not precached: the font's licence travels with the font (SIL OFL 1.1), and install-sheet screenshots
// are only read by the browser's install UI, so no phone should carry them in its cache.
export function siteExtras() {
  const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', ROOT), 'utf8'));
  return ['./fonts/OFL.txt', ...(manifest.screenshots ?? []).map((s) => s.src)];
}

/** Every file GitHub Pages serves: the service worker, what it precaches, and the extras above. Nothing else. */
export function siteFiles(assets = readSw().assets) {
  return ['./sw.js', ...assets, ...siteExtras()];
}

/** Copies siteFiles() into `out` (a directory URL ending in /), replacing whatever was there. */
export function buildSite(out) {
  rmSync(out, { recursive: true, force: true });
  for (const file of siteFiles()) {
    const to = new URL(file, out);
    mkdirSync(new URL('./', to), { recursive: true });
    copyFileSync(new URL(file, ROOT), to);
  }
}

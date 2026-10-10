// Shared by tools/stamp-sw.mjs, tools/site.mjs and the tests: reads the precache list out of sw.js, hashes the
// listed files (so VERSION changes whenever any shipped byte changes), and builds the published site from it.
import { readFileSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const ROOT = new URL('../', import.meta.url);
export const SW = new URL('sw.js', ROOT);

const ASSETS_RE = /\/\* ASSETS:start \*\/([\s\S]*?)\/\* ASSETS:end \*\//;
export const VERSION_RE = /const VERSION = '([^']*)';/;
// index.html carries its own version too, so a page knows which one it is (src/ui/pwa.js). Left out of the hash, which
// it is written from: the hash reads the tag with its content emptied.
export const PAGE = new URL('index.html', ROOT);
export const PAGE_VERSION_RE = /<meta name="version" content="([^"]*)" \/>/;
const unstamped = (html) => html.replace(PAGE_VERSION_RE, '<meta name="version" content="" />');

export function readSw(source = readFileSync(SW, 'utf8')) {
  return {
    source,
    version: source.match(VERSION_RE)?.[1],
    assets: JSON.parse(source.match(ASSETS_RE)[1]),
  };
}

/** The VERSION of `assets` as found under `root` (a directory URL ending in /): the repo, or a copy of the site. */
export function assetsHash(assets, root = ROOT) {
  const hash = createHash('sha256');
  for (const a of assets) {
    const bytes = readFileSync(new URL(a, root));
    hash.update(a).update('\0').update(a === './index.html' ? unstamped(bytes.toString('utf8')) : bytes).update('\0');
  }
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

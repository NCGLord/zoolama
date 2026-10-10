// Writes the current asset hash into sw.js VERSION, and into index.html's own version tag. Run after changing any
// precached file: `npm run stamp`.
import { readFileSync, writeFileSync } from 'node:fs';
import { PAGE, PAGE_VERSION_RE, SW, VERSION_RE, readSw, assetsHash } from './sw-assets.mjs';

const { source, version, assets } = readSw();
const next = assetsHash(assets);
const page = readFileSync(PAGE, 'utf8');
if (next === version && page.match(PAGE_VERSION_RE)?.[1] === next) {
  console.log(`sw.js VERSION already ${next}`);
} else {
  writeFileSync(SW, source.replace(VERSION_RE, `const VERSION = '${next}';`));
  writeFileSync(PAGE, page.replace(PAGE_VERSION_RE, `<meta name="version" content="${next}" />`));
  console.log(`sw.js VERSION ${version} → ${next}`);
}

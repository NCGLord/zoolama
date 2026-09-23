// Writes the current asset hash into sw.js VERSION. Run after changing any precached file: `npm run stamp`.
import { writeFileSync } from 'node:fs';
import { SW, VERSION_RE, readSw, assetsHash } from './sw-assets.mjs';

const { source, version, assets } = readSw();
const next = assetsHash(assets);
if (next === version) {
  console.log(`sw.js VERSION already ${next}`);
} else {
  writeFileSync(SW, source.replace(VERSION_RE, `const VERSION = '${next}';`));
  console.log(`sw.js VERSION ${version} → ${next}`);
}

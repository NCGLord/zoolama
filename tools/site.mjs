// Builds the site GitHub Pages publishes: `npm run site [dir]` (default _site/). Only the app's own files go in:
// sw.js, everything it precaches, and the few extras listed in sw-assets.mjs — never tests, tools or docs.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { buildSite, siteFiles } from './sw-assets.mjs';

const out = pathToFileURL(`${resolve(process.argv[2] ?? '_site')}/`);
buildSite(out);
console.log(`${siteFiles().length} files → ${out.pathname}`);

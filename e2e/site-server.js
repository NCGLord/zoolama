// A copy of the published site behind a server the test controls, for the tests that deploy a new version under the
// running app (deploy.spec.js). Playwright's own server (playwright.config.js) serves one fixed site, which is no use
// to them. Named so neither `node --test` nor Playwright mistakes it for a test file.
import http from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PAGE_VERSION_RE, VERSION_RE, assetsHash, buildSite, readSw } from '../tools/sw-assets.mjs';

const TYPES = {
  '.js': 'text/javascript',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

/**
 * Builds the site as `npm run site` does into `dir`/zoolama/ and serves it under /zoolama/, as Pages does. Returns the
 * app's url and the controls: deploy() a new version, hold() a request back until released.
 */
export async function serveSite(dir) {
  const app = join(dir, 'zoolama');
  buildSite(pathToFileURL(`${app}/`));
  const holds = new Map(); // path → { requested, release, released }

  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (!path.startsWith('/zoolama/')) return res.writeHead(404).end();
    const file = path.slice('/zoolama/'.length) || 'index.html';
    const held = holds.get(file);
    if (held) {
      held.requested.resolve();
      await held.released;
    }
    try {
      const body = await readFile(join(app, file));
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(held ? 204 : 404).end(); // a held path need not be a file: a gate the page waits on
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  return {
    origin,
    url: `${origin}/zoolama/`,

    /**
     * A deploy, as `npm run stamp` and Pages make it: every module marked as `build` (each one, once run, records it
     * in self.builds), then sw.js and index.html stamped with the new VERSION. Files in `stale` are then put back as
     * they were, as a CDN midway through a deploy can still hand them out. Returns the new VERSION.
     */
    async deploy(build, { stale = [] } = {}) {
      const kept = new Map();
      for (const file of stale) kept.set(file, await readFile(join(app, file)));
      for (const file of await modules(join(app, 'src'))) {
        const name = file.slice(app.length + 1);
        await writeFile(file, `${await readFile(file, 'utf8')}\n(self.builds ??= {})['${name}'] = '${build}';\n`);
      }
      const sw = join(app, 'sw.js');
      const { source, assets } = readSw(await readFile(sw, 'utf8'));
      const version = assetsHash(assets, pathToFileURL(`${app}/`));
      await writeFile(sw, source.replace(VERSION_RE, `const VERSION = '${version}';`));
      const page = join(app, 'index.html');
      await writeFile(page, (await readFile(page, 'utf8')).replace(PAGE_VERSION_RE, `<meta name="version" content="${version}" />`));
      for (const [file, bytes] of kept) await writeFile(join(app, file), bytes);
      return version;
    },

    /**
     * Holds back every request for `file` (relative to zoolama/) until release(). `requested` settles at the first one.
     */
    hold(file) {
      const requested = Promise.withResolvers();
      const released = Promise.withResolvers();
      const release = () => {
        holds.delete(file);
        released.resolve();
      };
      holds.set(file, { requested, released: released.promise, release });
      return { requested: requested.promise, release };
    },

    close() {
      for (const { release } of [...holds.values()]) release();
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

async function modules(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await modules(path)));
    else if (path.endsWith('.js')) files.push(path);
  }
  return files;
}

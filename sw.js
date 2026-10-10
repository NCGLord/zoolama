// Offline-first service worker. VERSION is a hash of the ASSETS below, written by `npm run stamp`;
// test/sw.test.js fails when it is stale, so a changed file can never hide behind an old cache.
const VERSION = '514bf5960593';
const CACHE = `zoolama-${VERSION}`;

const ASSETS = /* ASSETS:start */ [
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./src/app.js",
  "./src/backup.js",
  "./src/budget.js",
  "./src/cart.js",
  "./src/compare.js",
  "./src/delight.js",
  "./src/history.js",
  "./src/i18n.js",
  "./src/install.js",
  "./src/keyboard.js",
  "./src/launch.js",
  "./src/magnifier.js",
  "./src/money.js",
  "./src/photos.js",
  "./src/plan.js",
  "./src/share.js",
  "./src/state.js",
  "./src/store.js",
  "./src/tabs.js",
  "./src/theme.js",
  "./src/units.js",
  "./src/update.js",
  "./src/usage.js",
  "./src/ui/about-screen.js",
  "./src/ui/about-view.js",
  "./src/ui/app-state.js",
  "./src/ui/cart-lines.js",
  "./src/ui/cart-store.js",
  "./src/ui/cart-view.js",
  "./src/ui/compare-view.js",
  "./src/ui/dom.js",
  "./src/ui/entry.js",
  "./src/ui/history-view.js",
  "./src/ui/line-sheet.js",
  "./src/ui/magnifier-ui.js",
  "./src/ui/photo-cache.js",
  "./src/ui/photos-ui.js",
  "./src/ui/plan-view.js",
  "./src/ui/price-memory.js",
  "./src/ui/pwa.js",
  "./src/ui/share-sheet.js",
  "./src/ui/shell.js",
  "./src/ui/text.js",
  "./src/ui/till-field.js",
  "./src/ui/toast.js",
  "./src/ui/wake-lock.js",
  "./fonts/barlow-condensed-700.woff2",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon-180.png"
] /* ASSETS:end */;

// The page's own copy of VERSION, which `npm run stamp` writes into index.html and leaves out of the hash.
const PAGE_VERSION_RE = /<meta name="version" content="([^"]*)" \/>/;

/**
 * VERSION as `npm run stamp` computes it (assetsHash, tools/sw-assets.mjs), over `files`, the bytes of each of ASSETS:
 * sha256 over each one's name, \0, its bytes and \0, in order, index.html with its version emptied; 12 hex digits.
 * WebCrypto hashes only whole buffers, so the files go in as one; the lot is a few hundred KB.
 */
async function assetsHash(files) {
  const utf8 = new TextEncoder();
  const parts = ASSETS.flatMap((a, i) => {
    const bytes = a === './index.html' ? utf8.encode(unstamped(files[i])) : files[i];
    return [utf8.encode(a), '\0', bytes, '\0'];
  });
  const digest = await crypto.subtle.digest('SHA-256', await new Blob(parts).arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

/** The page as text, its version emptied: what the hash reads, as Node's toString('utf8') reads it (BOM kept). */
const pageText = (bytes) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
const unstamped = (bytes) => pageText(bytes).replace(PAGE_VERSION_RE, '<meta name="version" content="" />');

// Install is all-or-nothing: a flaky in-store signal can't leave a half-updated mix of files.
// cache: 'reload' skips the HTTP cache, but a CDN midway through a deploy can still hand out any file of the last
// version beside this sw.js: an old module beside a new app.js would be the app, offline too, until the next update. So
// every file cached must be the one VERSION was stamped from, and the page must carry VERSION itself (its <meta
// name="version">), or it would be taken for a page left behind (src/ui/pwa.js) every time it opens.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        await cache.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' })));
        const files = await Promise.all(ASSETS.map(async (a) => new Uint8Array(await (await cache.match(a)).arrayBuffer())));
        const page = pageText(files[ASSETS.indexOf('./index.html')]);
        if (page.match(PAGE_VERSION_RE)?.[1] !== VERSION) throw new Error(`index.html isn't ${VERSION}`);
        const hash = await assetsHash(files);
        if (hash !== VERSION) throw new Error(`the files cached are ${hash}, not ${VERSION}`);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('zoolama-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The About tab asks which version is running; the answer goes back on the port the question came with.
self.addEventListener('message', (event) => {
  if (event.data === 'version') event.ports[0]?.postMessage(VERSION);
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // Every navigation (/, /index.html, ?anything) gets the cached app shell.
  const cached =
    request.mode === 'navigate'
      ? caches.match('./index.html', { cacheName: CACHE })
      : caches.match(request, { cacheName: CACHE, ignoreSearch: true });
  event.respondWith(cached.then((hit) => hit ?? fetch(request)));
});

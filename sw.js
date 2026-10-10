// Offline-first service worker. VERSION is a hash of the ASSETS below, written by `npm run stamp`;
// test/sw.test.js fails when it is stale, so a changed file can never hide behind an old cache.
const VERSION = '24bc8823076e';
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

// Install is all-or-nothing: a flaky in-store signal can't leave a half-updated mix of files.
// cache: 'reload' skips the HTTP cache, so a new version never precaches stale copies. And the page must be this
// version's own (its <meta name="version">): a CDN midway through a deploy can still hand out the last one, and a page
// that isn't this version's would be taken for one left behind (src/ui/pwa.js) every time it opens.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        await cache.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' })));
        const page = await (await cache.match('./index.html')).text();
        if (!page.includes(`<meta name="version" content="${VERSION}" />`)) throw new Error(`index.html isn't ${VERSION}`);
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

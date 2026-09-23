// Offline-first service worker. VERSION is a hash of the ASSETS below, written by `npm run stamp`;
// test/sw.test.js fails when it is stale, so a changed file can never hide behind an old cache.
const VERSION = 'd4a0f2916783';
const CACHE = `zoolama-${VERSION}`;

const ASSETS = /* ASSETS:start */ [
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./src/app.js",
  "./src/budget.js",
  "./src/cart.js",
  "./src/compare.js",
  "./src/delight.js",
  "./src/history.js",
  "./src/i18n.js",
  "./src/install.js",
  "./src/money.js",
  "./src/photos.js",
  "./src/share.js",
  "./src/store.js",
  "./src/theme.js",
  "./src/units.js",
  "./src/update.js",
  "./fonts/barlow-condensed-700.woff2",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon-180.png"
] /* ASSETS:end */;

// Install is all-or-nothing: a flaky in-store signal can't leave a half-updated mix of files.
// cache: 'reload' skips the HTTP cache, so a new version never precaches stale copies.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' }))))
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

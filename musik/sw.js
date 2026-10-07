/* Service Worker: App-Shell offline verfügbar machen.
 *  - Code, Daten (JSON): "Netzwerk zuerst" → immer aktuell, offline aus dem Cache.
 *  - Bilder/Icons: "Cache zuerst".
 *  - Audio wird nicht abgefangen (Range-Requests/Streaming übernimmt der Browser).
 */
const VERSION = 'rouge-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/base.css', 'css/components.css', 'css/views.css', 'css/player.css',
  'data/catalog.json', 'assets/img/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/assets/audio/') || req.headers.has('range')) return;

  const isImage = /\.(png|jpe?g|webp|svg|ico)$/i.test(url.pathname);
  event.respondWith(isImage ? cacheFirst(req) : networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

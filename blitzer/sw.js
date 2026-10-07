/* Service Worker: App-Dateien offline, Kartenkacheln mit Zwischenspeicher */
const APP = 'blitzer-app-v1';
const TILES = 'blitzer-tiles-v1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/images/marker-icon.png', 'vendor/images/layers.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== APP && k !== TILES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'tile.openstreetmap.org') {
    e.respondWith(caches.open(TILES).then(async c => {
      try {
        const r = await fetch(e.request);
        if (r.ok) { c.put(e.request, r.clone()); trim(c); }
        return r;
      } catch { return (await c.match(e.request)) || Response.error(); }
    }));
    return;
  }
  if (url.origin === location.origin) {
    // Netzwerk zuerst (immer aktuelle App), offline aus dem Cache
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone(); caches.open(APP).then(c => c.put(e.request, copy)); return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
  }
});
async function trim(c) {
  const keys = await c.keys();
  if (keys.length > 600) for (const k of keys.slice(0, keys.length - 600)) c.delete(k);
}

// Road Trip — offline cache. Bump CACHE when a file below changes. The cars come from /api/roadtrip, which goes to
// the network as before: the page keeps its own copy of them.
const CACHE = 'roadtrip-v5';
const FILES = ['./', './index.html', './app.js', './data.js', './import.js', './manifest.json', './icon-180.png', './icon-512.png',
  '../shared/base.css', '../shared/base.js', '../shared/account.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('roadtrip-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Serve from cache, refresh the cache in the background. The API is never cached.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(e.request);
    const net = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

const CACHE = 'counter-v36';
const FILES = ['./', './index.html', './manifest.json', './icon-180.png', './icon-512.png', '../shared/base.css', '../shared/base.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('counter-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Serve from cache, refresh the cache in the background. Only the page itself is refreshed (scripts, styles, icons and the
// manifest change with a CACHE bump). waitUntil keeps the worker alive until the new copy is stored.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const fresh = e.request.mode === 'navigate' || /\.(js|css)$/.test(url.pathname);
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(e.request);
    if (hit && !fresh) return hit;
    const net = fetch(e.request, { cache: 'no-cache' }).then(async r => { if (r.ok) await cache.put(e.request, r.clone()); return r; })
      .catch(() => hit || cache.match('./index.html'));
    if (hit) e.waitUntil(net.catch(() => {}));
    return hit || net;
  }));
});

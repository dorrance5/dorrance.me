/* dorrance.me home page — offline cache. Bump CACHE when the home page or a file below changes.
   Its scope is the whole site, so it answers only for the home page's own files. The apps and Recipes have
   their own service workers, and everything else (the API, mycat.html) goes to the network as before. */
const CACHE = 'home-v4';
const APPS = ['calculator', 'counter', 'converter', 'triangle', 'tvmount', 'roadtrip', 'recipes'];
const FILES = ['./', './index.html', './favicon.ico', './favicon.svg', './apple-touch-icon.png', './photos/cat-thumb.jpg',
  ...APPS.flatMap(a => [`./${a}/icon-180.png`, `./${a}/icon-180-light.png`])];
const PATHS = new Set(FILES.map(f => new URL(f, location).pathname));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('home-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Serve from cache, refresh the cache in the background
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !PATHS.has(url.pathname)) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(e.request);
    const net = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

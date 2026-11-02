/* Recipes — offline cache. Bump CACHE when a file the page uses changes.
   The recipes and the meal plan (recipes.json and /api/) always go to the network: the page keeps its own copy
   of them on the phone and says when it shows that copy. */
const CACHE = 'recipes-v5';
const FILES = ['./', './index.html', './app.js', './data.js', './meals.js', '../shared/account.js',
  './favicon.svg', './favicon-32.png', './apple-touch-icon.png', './fonts/figtree-latin.woff2', './fonts/fraunces-latin.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('recipes-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Serve from cache, refresh the cache in the background
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.endsWith('/recipes.json')) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(e.request);
    const net = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

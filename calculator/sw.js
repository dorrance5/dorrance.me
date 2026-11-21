/* Calculator — offline cache.
   Bump CACHE below whenever you upload a changed index.html,
   otherwise phones may keep serving the old copy. */
const CACHE = "calculator-v28";
const FILES = ["./", "./index.html", "./manifest.json", "./icon-180.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("calculator-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Serve from cache, refresh the cache in the background, so a weak signal does not hold up the start.
// Only the page itself is refreshed (icons and the manifest change with a CACHE bump). waitUntil keeps the worker
// alive until the new copy is stored.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(e.request);
    if (hit && e.request.mode !== "navigate") return hit;
    const net = fetch(e.request, { cache: "no-cache" }).then(async r => { if (r.ok) await cache.put(e.request, r.clone()); return r; })
      .catch(() => hit || cache.match("./index.html"));
    if (hit) e.waitUntil(net.catch(() => {}));
    return hit || net;
  }));
});

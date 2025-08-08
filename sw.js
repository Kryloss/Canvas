const CACHE_NAME = "gym-planner-canvas-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-180.png"
];

self.addEventListener("install", (e)=>{
  e.waitUntil((async ()=>{
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e)=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (e)=>{
  e.respondWith((async ()=>{
    const r = await caches.match(e.request);
    if (r) return r;
    try {
      const resp = await fetch(e.request);
      const cache = await caches.open(CACHE_NAME);
      cache.put(e.request, resp.clone());
      return resp;
    } catch (err) {
      return new Response("Offline", {status: 200, headers: {"Content-Type":"text/plain"}});
    }
  })());
});
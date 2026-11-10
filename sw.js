const CACHE_NAME = 'play-remi-pwa-v2';
const APP_ROOT = self.registration.scope;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([
      APP_ROOT,
      new URL('manifest.webmanifest', APP_ROOT),
      new URL('pastel-green-cards-icon.png', APP_ROOT),
      new URL('icons/icon-192.png', APP_ROOT),
      new URL('icons/icon-512.png', APP_ROOT),
      new URL('assets/sql-wasm.wasm', APP_ROOT)
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (request.mode === 'navigate') {
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || (await cache.match(APP_ROOT));
      }
    }

    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  })());
});

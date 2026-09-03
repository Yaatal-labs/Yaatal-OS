/* Yaatal OS no-op service worker (installed by scripts/build-shop.mjs).
   BOBO's bundle registers '/service-worker.js' at root scope; this harmless
   pass-through satisfies that registration without any fetch caching. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

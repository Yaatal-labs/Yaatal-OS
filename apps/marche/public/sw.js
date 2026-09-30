/* Kairmel Marché service worker: caches the app shell and the catalogue for offline use.
   Hand-written plain JS (no TS build step) so it stays easy to audit at a glance. Paths are
   resolved relative to the worker's own URL so this still works when the host is deployed
   under a sub-path, not just at a domain root. */
const CACHE_NAME = "kairmel-marche-v1";
const BASE = new URL("./", self.location.href).href;
const SHELL_PATHS = ["", "index.html", "catalogue.json", "manifest.webmanifest", "icons/marche-icon.svg"];
const SHELL_ASSETS = SHELL_PATHS.map((path) => new URL(path, BASE).href);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!url.href.startsWith(BASE)) return; // only ever serve our own shell/catalogue

  if (url.href === new URL("catalogue.json", BASE).href) {
    // Network-first: show the freshest catalogue when online, fall back to cache offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // Cache-first for the app shell itself.
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});

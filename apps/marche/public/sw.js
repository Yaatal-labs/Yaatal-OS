/* Kairmel Marché service worker: caches the app shell and the catalogue for offline use.
   Hand-written plain JS (no TS build step) so it stays easy to audit at a glance. Paths are
   resolved relative to the worker's own URL so this still works when the host is deployed
   under a sub-path, not just at a domain root.

   When Marché is built with a remote catalogue (VITE_CATALOGUE_URL), its origin is passed on
   this script's own URL (?catalogueUrl=...) at registration time -- see src/ui/sw-register.ts
   -- since this file has no build step to bake the value into directly. Unset, this worker
   behaves exactly as it always has: the bundled catalogue.json only. */
const CACHE_NAME = "kairmel-marche-v1";
const BASE = new URL("./", self.location.href).href;
const CATALOGUE_URL = new URL(self.location.href).searchParams.get("catalogueUrl");
const REMOTE_CATALOGUE_HREF = CATALOGUE_URL ? `${CATALOGUE_URL}/v1/catalogue` : null;
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

/** Network-first, falling back to whatever was cached last -- used for anything whose freshness
 *  matters more than raw speed: the local catalogue.json, and the remote catalogue when one is
 *  configured. */
function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    })
    .catch(() => caches.match(request));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // The remote catalogue API: a different origin from BASE, so this check comes first.
  if (REMOTE_CATALOGUE_HREF && url.href === REMOTE_CATALOGUE_HREF) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (!url.href.startsWith(BASE)) return; // only ever serve our own shell/catalogue beyond that

  if (url.href === new URL("catalogue.json", BASE).href) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for the app shell itself.
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});

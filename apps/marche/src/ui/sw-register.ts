/**
 * Best-effort only: if this fails, the app still works, just without the offline shell.
 *
 * `sw.js` is hand-written plain JS with no build step of its own (see its own comment), so it
 * can't read `import.meta.env.VITE_CATALOGUE_URL` directly. When a remote catalogue is
 * configured, its URL is passed on the service worker's own script URL instead -- the one
 * build-time value this registration call already has -- so the worker can cache that catalogue
 * too, the same way it caches the bundled one.
 */
export function registerServiceWorker(catalogueUrl?: string): void {
  if (!("serviceWorker" in navigator)) return;
  // Stripped the same way src/catalogue/source.ts normalizes it, so the URL the worker watches
  // for matches the one the page actually fetches.
  const normalized = catalogueUrl?.replace(/\/+$/, "");
  const scriptUrl = normalized ? `./sw.js?catalogueUrl=${encodeURIComponent(normalized)}` : "./sw.js";
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(scriptUrl).catch((error: unknown) => {
      console.warn("Kairmel Marché : le service worker ne s'est pas installé", error);
    });
  });
}

/** Best-effort only: if this fails, the app still works, just without the offline shell. */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error: unknown) => {
      console.warn("Kairmel Marché : le service worker ne s'est pas installé", error);
    });
  });
}

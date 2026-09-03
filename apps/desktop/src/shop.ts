/**
 * Shop window surface — buyer surface (OSR-03).
 *
 * Loads the bundled BOBO static web export (apps/desktop/public/shop/) as the
 * primary full-window surface. Receives sanitized product-navigation events
 * from the native host (originating in the Studio cockpit) and focuses the
 * matching BOBO product by driving the same-origin webview's history, which
 * react-navigation web follows via its deep-link config
 * (product/:productId → ProductDetail).
 *
 * No credentials, JWTs, or Engine URLs are configured here: BOBO calls the
 * Engine directly with its own auth, using the API URL baked at OS build time
 * (scripts/build-shop.mjs, EXPO_PUBLIC_ENGINE_API_URL).
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "./shop.css";

const SHOP_BUNDLE_URL = "/shop/index.html";
const PRODUCT_PATH_PREFIX = "/product/";

export interface ProductNavigationEvent {
  version: string;
  kind: "product-navigation";
  productId: string;
  source: string;
}

const productIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/** Pure: accept only bounded identifiers delivered by the host. */
export function sanitizeNavigationEvent(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const event = value as Partial<ProductNavigationEvent>;
  if (event.kind !== "product-navigation" || typeof event.productId !== "string") return null;
  const productId = event.productId.trim();
  return productIdPattern.test(productId) ? productId : null;
}

/** Pure: the same-origin history path react-navigation web matches. */
export function productPath(productId: string): string {
  return `${PRODUCT_PATH_PREFIX}${encodeURIComponent(productId)}`;
}

let frame: HTMLIFrameElement | null = null;

function focusProduct(productId: string): boolean {
  const win = frame?.contentWindow;
  if (!win) return false;
  try {
    win.history.pushState(null, "", productPath(productId));
    win.dispatchEvent(new PopStateEvent("popstate"));
    return true;
  } catch {
    return false; // cross-origin or unready — fall back to the catalog view
  }
}

export async function renderShop(app: HTMLElement): Promise<void> {
  app.innerHTML = `
    <div class="shell shop-shell shop-stage">
      <header class="shop-topbar">
        <div class="sell-brand"><span class="brand">YAATAL OS</span><span class="window-name">SHOP / BOBO</span></div>
        <span class="shop-note">Buyer surface — bundled BOBO</span>
      </header>
      <main class="shop-main"></main>
    </div>
  `;
  const main = app.querySelector<HTMLElement>(".shop-main");
  if (!main) return;

  frame = document.createElement("iframe");
  frame.title = "BOBO Shop buyer surface";
  frame.src = SHOP_BUNDLE_URL;
  frame.referrerPolicy = "no-referrer";
  main.replaceChildren(frame);

  let unlisten: UnlistenFn | null = null;
  try {
    unlisten = await listen<ProductNavigationEvent>("yaatal://product-navigation", (event) => {
      const productId = sanitizeNavigationEvent(event.payload);
      if (productId === null) return;
      if (!focusProduct(productId)) {
        // Honest degrade: BOBO stays on its catalog; the bundle may still be
        // loading. The buyer never sees a fake product view.
        console.info("shop: bundle not ready for product focus; showing catalog");
      }
    });
  } catch {
    // The event bridge is best-effort: the bundled BOBO still works standalone.
  }

  window.addEventListener("beforeunload", () => {
    unlisten?.();
    unlisten = null;
  });

  void invoke("request_shop_refresh", { scope: "catalog" }).catch(() => {});
}
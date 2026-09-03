/**
 * Shop pane — buyer surface (OSR-03).
 *
 * Loads the bundled BOBO static web export (apps/desktop/public/shop/) as the
 * full-pane surface. Receives sanitized product-navigation events from the
 * host (originating in the Studio cockpit) and focuses the matching BOBO
 * product by driving the same-origin webview's history, which
 * react-navigation web follows via its deep-link config
 * (product/:productId → ProductDetail).
 *
 * No credentials, JWTs, or Engine URLs are configured here: BOBO calls the
 * Engine directly with its own auth, using the API URL baked at OS build time
 * (scripts/build-shop.mjs, EXPO_PUBLIC_ENGINE_API_URL).
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { PaneController, Theme } from "./sell";
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

export interface ShopRenderOptions {
  theme: Theme;
  initialProductId: string | null;
}

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

/**
 * Constrain the embedded Shop surface.
 *
 * React Native Web lays inputs and buttons out full-width, which is right on a phone
 * and wrong in a 1900px desktop pane: the login form rendered as a single email field
 * more than a thousand pixels wide with a primary button to match. Reading order
 * collapses at that measure and the surface stops looking like part of the shell.
 *
 * This is a shell-side mitigation, not the real fix. The real fix is BOBO honouring
 * `embedded=1` itself, as Studio does. Kept deliberately narrow - measure and centring
 * only - so it cannot fight BOBO's own visual decisions.
 */
function applyShopChrome(target: HTMLIFrameElement | null): void {
  const doc = target?.contentDocument;
  if (!doc) return;
  doc.documentElement.dataset.yaatalEmbedded = "true";
  let style = doc.querySelector<HTMLStyleElement>("#yaatal-os-embed");
  if (!style) {
    style = doc.createElement("style");
    style.id = "yaatal-os-embed";
    doc.head.append(style);
  }
  style.textContent = `
    /* A readable measure, centred, instead of the full pane width. */
    input, textarea, select { max-width: 420px; }
    input[type="email"], input[type="password"], input[type="text"] {
      width: 100% !important;
      max-width: 420px;
      margin-inline: auto;
    }
    /* Any full-bleed primary action shrinks to the same measure. */
    [role="button"], button { max-width: 420px; margin-inline: auto; }
    /* Centre the column the form sits in without assuming BOBO's class names. */
    #root > div { align-items: center; }
  `;
}

function applyShopTheme(target: HTMLIFrameElement | null, theme: Theme): void {
  const document = target?.contentDocument;
  if (!document) return;
  document.documentElement.dataset.yaatalTheme = theme;
  let style = document.querySelector<HTMLStyleElement>("#yaatal-os-theme");
  if (!style) {
    style = document.createElement("style");
    style.id = "yaatal-os-theme";
    document.head.append(style);
  }
  style.textContent = theme === "dark"
    ? `
      html, body, #root { background: #101412 !important; color: #f1e8d5 !important; }
      [style*="background-color: rgb(253, 251, 247)"],
      [style*="background-color: rgb(255, 255, 255)"],
      [style*="background-color: rgb(243, 244, 246)"] { background-color: #171c18 !important; }
      [style*="color: rgb(17, 24, 39)"],
      [style*="color: rgb(75, 85, 99)"] { color: #f1e8d5 !important; }
      [style*="color: rgb(156, 163, 175)"] { color: #b9b09d !important; }
      [style*="border-color: rgb(229, 231, 235)"],
      [style*="border-color: rgb(209, 213, 219)"] { border-color: #514633 !important; }
      [style*="background-color: rgb(46, 16, 101)"] { background-color: #315e49 !important; }
      [style*="color: rgb(46, 16, 101)"] { color: #68a87d !important; }
    `
    : `
      html, body, #root { background: #f4f0e6 !important; color: #1d211d !important; }
      [style*="background-color: rgb(46, 16, 101)"] { background-color: #214d3b !important; }
      [style*="color: rgb(46, 16, 101)"] { color: #214d3b !important; }
      [style*="border-color: rgb(46, 16, 101)"] { border-color: #214d3b !important; }
    `;
}

export async function renderShop(app: HTMLElement, options: ShopRenderOptions): Promise<PaneController> {
  let disposed = false;
  app.innerHTML = `
    <div class="shell shop-shell shop-stage">
      <main class="shop-main"></main>
    </div>
  `;
  const main = app.querySelector<HTMLElement>(".shop-main");
  if (!main) return { dispose: () => {}, setTheme: () => {} };

  frame = document.createElement("iframe");
  frame.title = "BOBO Shop buyer surface";
  // Studio is handed `?embedded=1&theme=` and honours it by hiding its own topbar
  // and sidebar. Shop was handed nothing, so BOBO rendered as a standalone app
  // inside the shell: its own branding, its own account surface, and a login form
  // stretched to the full width of the window. The flag is passed now so BOBO can
  // honour it once implemented; until then applyShopChrome below constrains the
  // layout from this side.
  frame.src = `${SHOP_BUNDLE_URL}?embedded=1&theme=${options.theme}`;
  frame.referrerPolicy = "no-referrer";
  main.replaceChildren(frame);

  const onFrameLoad = () => {
    if (disposed) return;
    applyShopTheme(frame, options.theme);
    applyShopChrome(frame);
    if (options.initialProductId) focusProduct(options.initialProductId);
  };
  frame.addEventListener("load", onFrameLoad);

  let unlisten: UnlistenFn | null = null;
  try {
    unlisten = await listen<ProductNavigationEvent>("yaatal://product-navigation", (event) => {
      if (disposed) return;
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

  void invoke("request_shop_refresh", { scope: "catalog" }).catch(() => {});

  return {
    dispose: () => {
      disposed = true;
      frame?.removeEventListener("load", onFrameLoad);
      unlisten?.();
      unlisten = null;
      frame = null;
    },
    setTheme: (nextTheme) => {
      options.theme = nextTheme;
      applyShopTheme(frame, nextTheme);
    },
  };
}

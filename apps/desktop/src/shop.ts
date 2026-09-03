/**
 * Shop window surface — buyer surface.
 *
 * Loads the bundled BOBO static web export. Shop can request navigation and
 * refresh only. It has no access to Studio controls.
 */
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  type ProductNavigationRequest,
  sanitizeProductNavigation,
} from "@yaatal/os-protocol";

export function currentLabel(): "sell" | "shop" {
  const label = getCurrentWindow().label;
  return label === "shop" ? "shop" : "sell";
}

function configuredShopUrl(): string {
  const configured = import.meta.env.VITE_YAATAL_OS_SHOP_URL?.trim() || "http://127.0.0.1:5173";
  try {
    const url = new URL(configured);
    const hasSensitiveQuery = [...url.searchParams.keys()].some((key) => /token|jwt|secret/i.test(key));
    if ((url.protocol !== "http:" && url.protocol !== "https:") || hasSensitiveQuery) {
      return "http://127.0.0.1:5173";
    }
    return url.toString();
  } catch {
    return "http://127.0.0.1:5173";
  }
}

export async function renderShop(app: HTMLElement): Promise<void> {
  const shopUrl = configuredShopUrl();
  app.innerHTML = `
    <div class="shell shop-shell">
      <header><p class="brand">YAATAL OS</p><p class="window-name">SHOP / BOBO</p></header>
      <section class="hero"><p class="eyebrow">Buyer surface</p><h1>Browse the local or bundled shop.</h1><p>Shop can request navigation and refresh only. It has no access to Studio controls.</p></section>
      <section class="shop-target"><p class="eyebrow">Configured Shop target</p><a id="shop-link" rel="noreferrer">Open BOBO Shop</a><p id="shop-url"></p></section>
      <form id="product-form" class="product-form"><label for="product-id">Product ID</label><input id="product-id" maxlength="128" autocomplete="off" placeholder="e.g. kaftan_42" /><button type="submit">Request product view</button></form>
      <div class="actions"><button id="refresh-shop" type="button">Request catalog refresh</button></div>
      <p class="message" data-shell-message aria-live="polite"></p>
    </div>
  `;
  const link = app.querySelector<HTMLAnchorElement>("#shop-link");
  const url = app.querySelector<HTMLElement>("#shop-url");
  if (link && url) {
    link.href = shopUrl;
    url.textContent = shopUrl;
  }
  app.querySelector<HTMLFormElement>("#product-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const productId = app.querySelector<HTMLInputElement>("#product-id")?.value ?? "";
    const request = sanitizeProductNavigation({ kind: "product-navigation", productId });
    if (!request) {
      const target = app.querySelector<HTMLElement>("[data-shell-message]");
      if (target) target.textContent = "Enter a simple product identifier.";
      return;
    }
    void invoke("request_product_navigation", { request: request satisfies ProductNavigationRequest });
  });
  app.querySelector<HTMLButtonElement>("#refresh-shop")?.addEventListener("click", () => {
    void invoke("request_shop_refresh", { scope: "catalog" });
  });
}
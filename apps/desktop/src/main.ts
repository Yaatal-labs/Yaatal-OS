/** Yaatal OS single-window shell. */
import "./style.css";

import { renderSell, type PaneController, type Theme } from "./sell";
import { renderShop } from "./shop";

export type Pane = "sell" | "shop";

const THEME_KEY = "yaatal-os-theme";
let activePane: Pane = "sell";
let activeController: PaneController | null = null;
let theme: Theme = readTheme();
let pendingProductId: string | null = null;
let renderRevision = 0;

function readTheme(): Theme {
  return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
}

function icon(name: "home" | "live" | "products" | "orders" | "customers" | "settings" | "theme"): string {
  const paths = {
    home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
    live: '<path d="M8.5 8.5a5 5 0 0 0 0 7M5.5 5.5a9 9 0 0 0 0 13M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/><circle cx="12" cy="12" r="2"/>',
    products: '<path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
    orders: '<path d="M7 3h10v3h3v15H4V6h3zM8 11h8M8 15h8"/>',
    customers: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20c0-4 2-6 6-6s6 2 6 6M15 15c4 0 6 1.7 6 5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    theme: '<path d="M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5Z"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24">${paths[name]}</svg>`;
}

function shellMarkup(): string {
  return `
    <div class="os-app">
      <aside class="os-rail" aria-label="Yaatal navigation">
        <div class="os-brand"><span class="os-mark" aria-hidden="true">Y</span><span>YAATAL OS</span></div>
        <nav class="os-nav">
          <button type="button" disabled title="Home workspace follows the POC">${icon("home")}<span>Home</span><small>Soon</small></button>
          <button type="button" data-destination="sell">${icon("live")}<span>Live</span></button>
          <button type="button" data-destination="shop">${icon("products")}<span>Products</span></button>
          <button type="button" disabled title="Order workspace follows the POC">${icon("orders")}<span>Orders</span><small>Soon</small></button>
          <button type="button" disabled title="Customer workspace follows the POC">${icon("customers")}<span>Customers</span><small>Soon</small></button>
        </nav>
        <button type="button" class="os-settings" disabled>${icon("settings")}<span>Settings</span></button>
      </aside>

      <section class="os-workspace">
        <header class="os-topbar">
          <nav class="os-segments" aria-label="Workspace" role="tablist">
            <button type="button" data-pane="sell" role="tab">SELL</button>
            <button type="button" data-pane="shop" role="tab">SHOP</button>
          </nav>
          <div class="os-accountbar">
            <span class="os-connection"><i id="os-sidecar-dot" aria-hidden="true"></i><span id="os-sidecar-label">Local</span></span>
            <span class="os-language">FR · EN</span>
            <button type="button" class="os-theme" id="os-theme" aria-label="Switch color theme">${icon("theme")}</button>
            <button type="button" class="os-profile" title="Shared Engine login is the next security seam">
              <span class="os-avatar">A</span><span><strong>Awa Ndiaye</strong><small>Demo workspace</small></span>
            </button>
          </div>
        </header>
        <main id="os-pane" class="os-pane" tabindex="-1"></main>
      </section>
    </div>
  `;
}

function applyTheme(next: Theme): void {
  theme = next;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  document.querySelector<HTMLButtonElement>("#os-theme")?.setAttribute(
    "aria-label",
    theme === "dark" ? "Use light theme" : "Use dark theme",
  );
  activeController?.setTheme(theme);
}

function setSidecarState(state: string): void {
  const dot = document.querySelector<HTMLElement>("#os-sidecar-dot");
  const label = document.querySelector<HTMLElement>("#os-sidecar-label");
  dot?.setAttribute("data-state", state);
  if (label) label.textContent = state === "ready" ? "Connected" : state === "failed" ? "Attention" : "Local";
}

function updateNavigation(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-pane]").forEach((tab) => {
    const selected = tab.dataset.pane === activePane;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-destination]").forEach((item) => {
    item.classList.toggle("active", item.dataset.destination === activePane);
  });
}

export async function switchPane(pane: Pane, productId?: string): Promise<void> {
  if (productId) pendingProductId = productId;
  if (pane === activePane && activeController) return;

  activePane = pane;
  updateNavigation();
  activeController?.dispose();
  activeController = null;

  const paneRoot = document.querySelector<HTMLElement>("#os-pane");
  if (!paneRoot) return;
  paneRoot.replaceChildren();
  const revision = ++renderRevision;

  const controller = pane === "shop"
    ? await renderShop(paneRoot, { theme, initialProductId: pendingProductId })
    : await renderSell(paneRoot, {
        theme,
        onSidecarState: setSidecarState,
        onProductNavigation: (id) => void switchPane("shop", id),
      });

  if (revision !== renderRevision) {
    controller.dispose();
    return;
  }
  activeController = controller;
  if (pane === "shop") pendingProductId = null;
}

async function bootstrap(): Promise<void> {
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) return;
  app.innerHTML = shellMarkup();
  applyTheme(theme);

  app.querySelectorAll<HTMLButtonElement>("[data-pane], [data-destination]").forEach((control) => {
    control.addEventListener("click", () => {
      const destination = control.dataset.pane ?? control.dataset.destination;
      void switchPane(destination === "shop" ? "shop" : "sell");
    });
  });
  app.querySelector<HTMLButtonElement>("#os-theme")?.addEventListener("click", () => {
    applyTheme(theme === "dark" ? "light" : "dark");
  });

  updateNavigation();
  await switchPane("sell");
}

void bootstrap();

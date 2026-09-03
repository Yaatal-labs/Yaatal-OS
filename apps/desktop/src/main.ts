/** Yaatal OS single-window shell. */
import "./style.css";

import { invoke } from "@tauri-apps/api/core";
import { renderSell, type PaneController, type Theme } from "./sell";
import { renderShop } from "./shop";

export type Pane = "sell" | "shop";

const THEME_KEY = "yaatal-os-theme";
const RAIL_KEY = "yaatal-os-rail";
let activePane: Pane = "sell";
let activeController: PaneController | null = null;
let theme: Theme = readTheme();
let pendingProductId: string | null = null;
let renderRevision = 0;

function readRail(): "expanded" | "collapsed" {
  return localStorage.getItem(RAIL_KEY) === "collapsed" ? "collapsed" : "expanded";
}

function applyRail(state: "expanded" | "collapsed"): void {
  // A deliberate collapse must outrank the viewport breakpoint, so it is carried on
  // the element as state rather than left to a media query.
  const app = document.querySelector<HTMLElement>(".os-app");
  if (app) app.dataset.rail = state;
  localStorage.setItem(RAIL_KEY, state);
  const btn = document.querySelector<HTMLButtonElement>("#os-collapse");
  btn?.setAttribute("aria-expanded", state === "expanded" ? "true" : "false");
  btn?.setAttribute("aria-label", state === "expanded" ? "Réduire la navigation" : "Développer la navigation");
}

function readTheme(): Theme {
  // An explicit choice wins. Otherwise follow the OS: the previous default returned
  // "light" unconditionally, so a user on a dark desktop got a light app until they
  // found the toggle, and the stylesheet media query could never take effect because
  // applyTheme always stamped data-theme on load.
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function icon(name: "home" | "live" | "products" | "orders" | "customers" | "settings" | "theme" | "collapse"): string {
  const paths = {
    home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
    live: '<path d="M8.5 8.5a5 5 0 0 0 0 7M5.5 5.5a9 9 0 0 0 0 13M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/><circle cx="12" cy="12" r="2"/>',
    products: '<path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
    orders: '<path d="M7 3h10v3h3v15H4V6h3zM8 11h8M8 15h8"/>',
    customers: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20c0-4 2-6 6-6s6 2 6 6M15 15c4 0 6 1.7 6 5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    theme: '<path d="M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5Z"/>',
    collapse: '<path d="M15 6l-6 6 6 6"/>',
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
        <button type="button" class="os-collapse" id="os-collapse" aria-expanded="true">${icon("collapse")}<span>Réduire</span></button>
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
            <button type="button" class="os-profile" id="os-profile" aria-haspopup="dialog" aria-expanded="false">
              <span class="os-avatar" id="os-avatar">?</span><span><strong id="os-profile-name">Not signed in</strong><small id="os-profile-sub">Sign in with your Engine account</small></span>
            </button>
          </div>
        </header>
        <dialog id="os-login-dialog">
          <form method="dialog" id="os-login-form">
            <span class="os-eyebrow">Yaatal OS</span>
            <h2>Sign in</h2>
            <p>One Engine login unlocks SELL and SHOP. Credentials go to the Rust host only — tokens never touch the web layer.</p>
            <label for="os-login-email">Email</label>
            <input id="os-login-email" type="email" autocomplete="username" required>
            <label for="os-login-password">Password</label>
            <input id="os-login-password" type="password" autocomplete="current-password" required>
            <p class="os-login-error" id="os-login-error" hidden></p>
            <div class="os-login-actions">
              <button type="button" class="os-login-cancel" id="os-login-cancel">Cancel</button>
              <button type="submit" class="os-login-submit">Sign in</button>
            </div>
          </form>
        </dialog>
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

// ── UXR-04: OS session state (sanitized — no tokens here, ever) ──
interface OsSession { authenticated: boolean; merchant_name: string | null; verified: boolean | null; }

function renderSession(session: OsSession): void {
  const avatar = document.querySelector<HTMLElement>("#os-avatar");
  const name = document.querySelector<HTMLElement>("#os-profile-name");
  const sub = document.querySelector<HTMLElement>("#os-profile-sub");
  const profile = document.querySelector<HTMLButtonElement>("#os-profile");
  if (!avatar || !name || !sub || !profile) return;
  if (session.authenticated) {
    const merchant = session.merchant_name || "Merchant";
    avatar.textContent = merchant.trim().charAt(0).toUpperCase() || "Y";
    name.textContent = merchant;
    sub.textContent = session.verified ? "Engine session active" : "Engine session active · unverified";
    profile.dataset.session = "active";
  } else {
    avatar.textContent = "?";
    name.textContent = "Not signed in";
    sub.textContent = "Sign in with your Engine account";
    profile.dataset.session = "locked";
  }
}

async function initSession(): Promise<void> {
  try {
    const session = await invoke<OsSession>("os_session_status");
    renderSession(session);
  } catch {
    renderSession({ authenticated: false, merchant_name: null, verified: null });
  }
  const dialog = document.querySelector<HTMLDialogElement>("#os-login-dialog");
  const profile = document.querySelector<HTMLButtonElement>("#os-profile");
  const form = document.querySelector<HTMLFormElement>("#os-login-form");
  const error = document.querySelector<HTMLElement>("#os-login-error");
  const cancel = document.querySelector<HTMLButtonElement>("#os-login-cancel");
  if (!dialog || !profile || !form) return;

  profile.addEventListener("click", async () => {
    const session = await invoke<OsSession>("os_session_status").catch(() => null);
    if (session?.authenticated) {
      // Signed in: the profile button becomes logout.
      const confirmed = window.confirm("Sign out of Yaatal OS?");
      if (!confirmed) return;
      const next = await invoke<OsSession>("os_logout").catch(() => null);
      if (next) renderSession(next);
      return;
    }
    error?.setAttribute("hidden", "");
    dialog.showModal();
  });
  cancel?.addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.querySelector<HTMLInputElement>("#os-login-email")?.value ?? "";
    const password = document.querySelector<HTMLInputElement>("#os-login-password")?.value ?? "";
    const submit = form.querySelector<HTMLButtonElement>(".os-login-submit");
    if (submit) submit.disabled = true;
    try {
      const session = await invoke<OsSession>("os_login", { email, password });
      renderSession(session);
      dialog.close();
    } catch (failure) {
      if (error) {
        error.textContent = String(failure).replace(/^"|"$/g, "");
        error.removeAttribute("hidden");
      }
    } finally {
      if (submit) submit.disabled = false;
    }
  });
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
  applyRail(readRail());
  void initSession();

  app.querySelectorAll<HTMLButtonElement>("[data-pane], [data-destination]").forEach((control) => {
    control.addEventListener("click", () => {
      const destination = control.dataset.pane ?? control.dataset.destination;
      void switchPane(destination === "shop" ? "shop" : "sell");
    });
  });
  app.querySelector<HTMLButtonElement>("#os-theme")?.addEventListener("click", () => {
    applyTheme(theme === "dark" ? "light" : "dark");
  });
  app.querySelector<HTMLButtonElement>("#os-collapse")?.addEventListener("click", () => {
    const app_ = document.querySelector<HTMLElement>(".os-app");
    applyRail(app_?.dataset.rail === "collapsed" ? "expanded" : "collapsed");
  });

  updateNavigation();
  await switchPane("sell");
}

void bootstrap();

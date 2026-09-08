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
let theme: Theme = typeof window === "undefined" ? "light" : readTheme();
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

export interface StudioBootstrapGrant {
  nonce: string;
  surface: "studio";
  expiresInSeconds: number;
}

type StudioAuthMessage =
  | { kind: "studio-auth-ready" }
  | { kind: "studio-auth-status"; action: "bootstrap" | "logout"; ok: boolean; errorCode?: string };

type StudioTarget = { frameWindow: Window; origin: string };

let currentSession: OsSession = { authenticated: false, merchant_name: null, verified: null };
let studioAuthState: "idle" | "pending" | "active" | "failed" = "idle";
let studioAuthNotice = "";
let studioBootstrapInFlight: Window | null = null;
let studioSyncInFlight: Window | null = null;
let studioLogoutPending = true;
const studioReadyFrames = new WeakSet<Window>();
let pendingStudioLogout: { frameWindow: Window; resolve: (ok: boolean) => void; timer: number } | null = null;

export function sanitizeStudioFrameOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function sanitizeStudioBootstrapGrant(value: unknown): StudioBootstrapGrant | null {
  if (!value || typeof value !== "object") return null;
  const grant = value as Record<string, unknown>;
  if ("token" in grant) return null;
  if (grant.surface !== "studio") return null;
  if (typeof grant.nonce !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(grant.nonce)) return null;
  if (!Number.isInteger(grant.expiresInSeconds) || Number(grant.expiresInSeconds) < 1 || Number(grant.expiresInSeconds) > 90) return null;
  return {
    nonce: grant.nonce,
    surface: "studio",
    expiresInSeconds: Number(grant.expiresInSeconds),
  };
}

export function sanitizeStudioAuthMessage(value: unknown): StudioAuthMessage | null {
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  if (message.version !== "yaatal-os.v1") return null;
  if ("nonce" in message) return null;
  if (message.kind === "studio-auth-ready") return { kind: "studio-auth-ready" };
  if (
    message.kind !== "studio-auth-status"
    || !["bootstrap", "logout"].includes(String(message.action))
    || typeof message.ok !== "boolean"
  ) return null;
  const errorCode = typeof message.errorCode === "string" && /^[a-z0-9_]{1,64}$/.test(message.errorCode)
    ? message.errorCode
    : undefined;
  return {
    kind: "studio-auth-status",
    action: message.action as "bootstrap" | "logout",
    ok: message.ok,
    ...(errorCode ? { errorCode } : {}),
  };
}

export function postStudioMessage(target: Pick<Window, "postMessage">, origin: string, message: object): void {
  const safeOrigin = sanitizeStudioFrameOrigin(origin);
  if (!safeOrigin || safeOrigin !== origin) throw new Error("invalid Studio target origin");
  target.postMessage(message, safeOrigin);
}

export async function settleCoordinatedLogout(
  clearEngine: () => Promise<unknown>,
  clearStudio: () => Promise<boolean>,
): Promise<{ engineCleared: boolean; studioCleared: boolean }> {
  const [engine, studio] = await Promise.allSettled([clearEngine(), clearStudio()]);
  return {
    engineCleared: engine.status === "fulfilled",
    studioCleared: studio.status === "fulfilled" && studio.value,
  };
}

export async function reconcileStudioReadyState(
  state: { engineAuthenticated: boolean; cleanupPending: boolean },
  clearStudio: () => Promise<boolean>,
  requestBootstrap: () => Promise<void>,
): Promise<{ engineAuthenticated: boolean; cleanupPending: boolean; action: "cleanup" | "bootstrap" }> {
  if (state.cleanupPending || !state.engineAuthenticated) {
    const cleared = await clearStudio();
    if (!cleared || !state.engineAuthenticated) {
      return {
        engineAuthenticated: state.engineAuthenticated,
        cleanupPending: !cleared,
        action: "cleanup",
      };
    }
  }
  await requestBootstrap();
  return {
    engineAuthenticated: state.engineAuthenticated,
    cleanupPending: false,
    action: "bootstrap",
  };
}

function studioTarget(): StudioTarget | null {
  const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Yaatal Studio seller cockpit"]');
  if (!frame?.contentWindow) return null;
  const origin = sanitizeStudioFrameOrigin(frame.src);
  return origin ? { frameWindow: frame.contentWindow, origin } : null;
}

function setStudioAuthState(state: typeof studioAuthState, notice = ""): void {
  studioAuthState = state;
  studioAuthNotice = notice;
  renderSession(currentSession);
}

async function requestStudioBootstrap(target = studioTarget(), cleanupConfirmed = false): Promise<void> {
  if (!target || !currentSession.authenticated || !studioReadyFrames.has(target.frameWindow)) return;
  if (studioLogoutPending && !cleanupConfirmed) return;
  if (studioBootstrapInFlight === target.frameWindow) return;
  studioBootstrapInFlight = target.frameWindow;
  setStudioAuthState("pending");
  try {
    const grant = sanitizeStudioBootstrapGrant(await invoke<unknown>("os_studio_bootstrap_grant"));
    const current = studioTarget();
    if (!grant) throw new Error("invalid Studio bootstrap grant");
    if (!current || current.frameWindow !== target.frameWindow || current.origin !== target.origin) return;
    postStudioMessage(current.frameWindow, current.origin, {
      version: "yaatal-os.v1",
      kind: "studio-auth-bootstrap",
      nonce: grant.nonce,
      surface: grant.surface,
      expiresInSeconds: grant.expiresInSeconds,
    });
  } catch {
    setStudioAuthState("failed", "Engine session active · Studio unlock failed");
  } finally {
    if (studioBootstrapInFlight === target.frameWindow) studioBootstrapInFlight = null;
  }
}

function requestStudioLogout(target = studioTarget()): Promise<boolean> {
  if (!target) return Promise.resolve(false);
  pendingStudioLogout?.resolve(false);
  window.clearTimeout(pendingStudioLogout?.timer);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      if (pendingStudioLogout?.frameWindow === target.frameWindow) pendingStudioLogout = null;
      resolve(false);
    }, 5000);
    pendingStudioLogout = { frameWindow: target.frameWindow, resolve, timer };
    postStudioMessage(target.frameWindow, target.origin, {
      version: "yaatal-os.v1",
      kind: "studio-auth-logout",
    });
  });
}

async function reconcileMountedStudio(target: StudioTarget): Promise<void> {
  if (studioSyncInFlight === target.frameWindow) return;
  studioSyncInFlight = target.frameWindow;
  try {
    const result = await reconcileStudioReadyState(
      {
        engineAuthenticated: currentSession.authenticated,
        cleanupPending: studioLogoutPending,
      },
      () => requestStudioLogout(target),
      () => requestStudioBootstrap(target, true),
    );
    studioLogoutPending = result.cleanupPending;
    if (!currentSession.authenticated) {
      studioAuthState = result.cleanupPending ? "failed" : "idle";
      studioAuthNotice = result.cleanupPending ? "Signed out · Studio cleanup pending" : "";
      renderSession(currentSession);
    }
  } finally {
    if (studioSyncInFlight === target.frameWindow) studioSyncInFlight = null;
  }
}

function handleStudioAuthMessage(event: MessageEvent): void {
  const target = studioTarget();
  if (!target || event.source !== target.frameWindow || event.origin !== target.origin) return;
  const message = sanitizeStudioAuthMessage(event.data);
  if (!message) return;
  if (message.kind === "studio-auth-ready") {
    studioReadyFrames.add(target.frameWindow);
    void reconcileMountedStudio(target);
    return;
  }
  if (message.action === "bootstrap") {
    setStudioAuthState(message.ok ? "active" : "failed", message.ok ? "" : "Engine session active · Studio unlock failed");
    return;
  }
  if (message.action === "logout" && pendingStudioLogout?.frameWindow === target.frameWindow) {
    const pending = pendingStudioLogout;
    pendingStudioLogout = null;
    window.clearTimeout(pending.timer);
    studioLogoutPending = !message.ok;
    pending.resolve(message.ok);
  }
}

function renderSession(session: OsSession): void {
  currentSession = session;
  const avatar = document.querySelector<HTMLElement>("#os-avatar");
  const name = document.querySelector<HTMLElement>("#os-profile-name");
  const sub = document.querySelector<HTMLElement>("#os-profile-sub");
  const profile = document.querySelector<HTMLButtonElement>("#os-profile");
  if (!avatar || !name || !sub || !profile) return;
  if (session.authenticated) {
    const merchant = session.merchant_name || "Merchant";
    avatar.textContent = merchant.trim().charAt(0).toUpperCase() || "Y";
    name.textContent = merchant;
    sub.textContent = studioAuthNotice || (studioAuthState === "active"
      ? "Engine + Studio sessions active"
      : studioAuthState === "pending"
        ? "Engine active · unlocking Studio"
        : session.verified ? "Engine session active" : "Engine session active · unverified");
    profile.dataset.session = "active";
  } else {
    avatar.textContent = "?";
    name.textContent = "Not signed in";
    sub.textContent = studioAuthNotice || "Sign in with your Engine account";
    profile.dataset.session = "locked";
  }
}

async function initSession(): Promise<void> {
  window.addEventListener("message", handleStudioAuthMessage);
  try {
    const session = await invoke<OsSession>("os_session_status");
    // A fresh renderer has no proof that an old HttpOnly Studio cookie was
    // cleared, so the first mounted Studio must synchronize before unlock.
    studioLogoutPending = true;
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
      studioLogoutPending = true;
      setStudioAuthState("pending", "Signing out Engine and Studio");
      let next: OsSession | null = null;
      const result = await settleCoordinatedLogout(
        async () => { next = await invoke<OsSession>("os_logout"); },
        requestStudioLogout,
      );
      studioLogoutPending = !result.studioCleared;
      studioAuthState = "idle";
      if (result.engineCleared && next) {
        studioAuthNotice = result.studioCleared ? "" : "Engine signed out · Studio cleanup failed";
        renderSession(next);
      } else {
        studioAuthNotice = result.studioCleared ? "Engine sign-out failed" : "Engine and Studio sign-out failed";
        renderSession(currentSession);
      }
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
      studioAuthState = "idle";
      studioAuthNotice = "";
      renderSession(session);
      dialog.close();
      const mountedStudio = studioTarget();
      if (mountedStudio && studioReadyFrames.has(mountedStudio.frameWindow)) {
        await reconcileMountedStudio(mountedStudio);
      }
    } catch (failure) {
      if (error) {
        error.textContent = String(failure).replace(/^"|"$/g, "");
        error.removeAttribute("hidden");
      }
    } finally {
      const passwordInput = document.querySelector<HTMLInputElement>("#os-login-password");
      if (passwordInput) passwordInput.value = "";
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

if (typeof document !== "undefined") void bootstrap();

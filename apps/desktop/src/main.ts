import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  type ProductNavigationRequest,
  type SidecarStatus,
  sanitizeProductNavigation,
  sanitizeSidecarStatus,
} from "@yaatal/os-protocol";

import "./style.css";

type ShellWindow = "sell" | "shop";

const fallbackStatus: SidecarStatus = {
  version: "yaatal-os.v1",
  kind: "sidecar-status",
  state: "stopped",
  isRunning: false,
  port: 8484,
};

function currentLabel(): ShellWindow {
  const label = getCurrentWindow().label;
  return label === "shop" ? "shop" : "sell";
}

function statusLabel(status: SidecarStatus): string {
  return status.state === "failed" && status.errorCode
    ? `Needs attention (${status.errorCode.replace("_", " ")})`
    : status.state[0].toUpperCase() + status.state.slice(1);
}

async function sidecarStatus(): Promise<SidecarStatus> {
  const result = await invoke<unknown>("sidecar_status");
  return sanitizeSidecarStatus(result) ?? fallbackStatus;
}

function createStatusCard(status: SidecarStatus): HTMLElement {
  const card = document.createElement("section");
  card.className = `status-card status-${status.state}`;
  card.innerHTML = `
    <p class="eyebrow">Studio loopback sidecar</p>
    <div class="status-row"><strong>${statusLabel(status)}</strong><span class="signal" aria-hidden="true"></span></div>
    <p>Local port ${status.port}. Connection detail stays in the native shell.</p>
  `;
  return card;
}

function createCockpit(status: SidecarStatus): HTMLElement {
  const region = document.createElement("section");
  region.className = "cockpit-region";
  if (status.state !== "ready") {
    region.innerHTML = "<p>Start Studio to load the governed seller cockpit in this window.</p>";
    return region;
  }
  const frame = document.createElement("iframe");
  frame.title = "Yaatal Studio seller cockpit";
  frame.src = `http://127.0.0.1:${status.port}/`;
  frame.allow = "microphone";
  frame.referrerPolicy = "no-referrer";
  region.replaceChildren(frame);
  return region;
}

function button(label: string, action: () => Promise<void>): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", () => {
    void action().catch((error: unknown) => {
      const target = document.querySelector<HTMLElement>("[data-shell-message]");
      if (target) target.textContent = error instanceof Error ? error.message : "Request unavailable";
    });
  });
  return element;
}

async function renderSell(app: HTMLElement): Promise<void> {
  let status = await sidecarStatus();
  app.innerHTML = `
    <div class="shell sell-shell">
      <header><p class="brand">YAATAL OS</p><p class="window-name">SELL / Studio</p></header>
      <section class="hero"><p class="eyebrow">Merchant control surface</p><h1>Sell with the local cockpit.</h1><p>Studio remains a loopback sidecar. Engine identity and commerce never move into this shell.</p></section>
      <div class="status-slot"></div>
      <div class="actions"></div>
      <p class="message" data-shell-message aria-live="polite"></p>
      <div class="cockpit-slot"></div>
    </div>
  `;
  const slot = app.querySelector<HTMLElement>(".status-slot");
  const actions = app.querySelector<HTMLElement>(".actions");
  const cockpit = app.querySelector<HTMLElement>(".cockpit-slot");
  if (!slot || !actions || !cockpit) return;
  const refresh = async () => {
    status = await sidecarStatus();
    slot.replaceChildren(createStatusCard(status));
    cockpit.replaceChildren(createCockpit(status));
  };
  slot.replaceChildren(createStatusCard(status));
  cockpit.replaceChildren(createCockpit(status));
  actions.append(
    button("Check status", refresh),
    button("Start Studio", async () => {
      await invoke("start_sidecar");
      await refresh();
    }),
    button("Stop Studio", async () => {
      await invoke("stop_sidecar");
      await refresh();
    }),
  );
}

async function renderShop(app: HTMLElement): Promise<void> {
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
  const link = document.querySelector<HTMLAnchorElement>("#shop-link");
  const url = document.querySelector<HTMLElement>("#shop-url");
  if (link && url) {
    link.href = shopUrl;
    url.textContent = shopUrl;
  }
  document.querySelector<HTMLFormElement>("#product-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const productId = document.querySelector<HTMLInputElement>("#product-id")?.value ?? "";
    const request = sanitizeProductNavigation({ kind: "product-navigation", productId });
    if (!request) {
      const target = document.querySelector<HTMLElement>("[data-shell-message]");
      if (target) target.textContent = "Enter a simple product identifier.";
      return;
    }
    void invoke("request_product_navigation", { request: request satisfies ProductNavigationRequest });
  });
  document.querySelector<HTMLButtonElement>("#refresh-shop")?.addEventListener("click", () => {
    void invoke("request_shop_refresh", { scope: "catalog" });
  });
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

async function bootstrap(): Promise<void> {
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) return;
  if (currentLabel() === "shop") await renderShop(app);
  else await renderSell(app);
}

void bootstrap();

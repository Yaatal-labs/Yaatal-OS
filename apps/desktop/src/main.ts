/**
 * Yaatal OS unified app shell (single window).
 *
 * SELL | SHOP segmented panes like a modern AI app — one window, one webview,
 * both surfaces alive. The pane router keeps the surfaces isolated: Shop
 * never renders into the Sell pane and cannot invoke sidecar lifecycle.
 */
import "./style.css";
import { invoke } from "@tauri-apps/api/core";
import { renderShop } from "./shop";
import { renderSell } from "./sell";

export type Pane = "sell" | "shop";
let activePane: Pane = "sell";

export function switchPane(pane: Pane): void {
  if (pane === activePane) return;
  activePane = pane;
  render();
}

async function bootstrap(): Promise<void> {
  render();
}

function render(): void {
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) return;

  app.innerHTML = `
    <div class="os-app">
      <header class="os-topbar">
        <div class="os-brand"><span class="brand">YAATAL OS</span></div>
        <nav class="os-segments" role="tablist">
          <button type="button" data-pane="sell" role="tab">Sell</button>
          <button type="button" data-pane="shop" role="tab">Shop</button>
        </nav>
        <div class="os-status" id="os-sidecar-dot" title="Studio sidecar"></div>
      </header>
      <main id="os-pane" class="os-pane"></main>
    </div>
  `;

  app.querySelectorAll<HTMLButtonElement>("[data-pane]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.pane === activePane);
    tab.addEventListener("click", () => {
      switchPane(tab.dataset.pane === "shop" ? "shop" : "sell");
    });
  });

  const pane = app.querySelector<HTMLElement>("#os-pane");
  if (!pane) return;
  if (activePane === "shop") void renderShop(pane);
  else void renderSell(pane);
}

// Studio-originated navigation hints switch to the Shop pane automatically.
window.addEventListener("message", (event) => {
  if (event.data?.kind === "product-navigation" && event.data.source === "studio") {
    switchPane("shop");
  }
});

void bootstrap();
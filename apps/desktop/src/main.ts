/**
 * Yaatal OS shell router — dispatches each Tauri window to its surface.
 *
 * Sell  → apps/desktop/src/sell.ts  (merchant, Studio cockpit)
 * Shop  → apps/desktop/src/shop.ts  (buyer, bundled BOBO)
 */
import "./style.css";
import { renderShop } from "./shop";
import { renderSell } from "./sell";
import { getCurrentWindow } from "@tauri-apps/api/window";

function currentLabel(): "sell" | "shop" {
  const label = getCurrentWindow().label;
  return label === "shop" ? "shop" : "sell";
}

async function bootstrap(): Promise<void> {
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) return;
  if (currentLabel() === "shop") await renderShop(app);
  else await renderSell(app);
}

void bootstrap();
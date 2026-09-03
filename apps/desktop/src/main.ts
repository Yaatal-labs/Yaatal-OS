/**
 * Yaatal OS shell router — dispatches each Tauri window to its surface.
 *
 * Sell  → apps/desktop/src/sell.ts  (merchant, Studio cockpit)
 * Shop  → apps/desktop/src/shop.ts  (buyer, bundled BOBO)
 */
import "./style.css";
import { currentLabel, renderShop } from "./shop";
import { renderSell } from "./sell";

async function bootstrap(): Promise<void> {
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) return;
  if (currentLabel() === "shop") await renderShop(app);
  else await renderSell(app);
}

void bootstrap();
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { productPath, sanitizeNavigationEvent, shopChromeCss } from "./shop";

describe("shop navigation receiver", () => {
  it("accepts only bounded product identifiers from the host event", () => {
    expect(sanitizeNavigationEvent({ kind: "product-navigation", productId: "kaftan_42", source: "studio" })).toBe("kaftan_42");
    expect(sanitizeNavigationEvent({ kind: "product-navigation", productId: " https://evil?token=x " })).toBeNull();
    expect(sanitizeNavigationEvent({ kind: "product-navigation", productId: "" })).toBeNull();
    expect(sanitizeNavigationEvent({ kind: "shop-refresh", productId: "kaftan_42" })).toBeNull();
    expect(sanitizeNavigationEvent(null)).toBeNull();
  });

  it("maps a product identifier to the same-origin deep-link path", () => {
    expect(productPath("kaftan_42")).toBe("/product/kaftan_42");
    expect(productPath("a b")).toBe("/product/a%20b");
  });

  it("does not constrain the React Native Web root while bounding form controls", () => {
    const css = shopChromeCss();

    expect(css.includes("#root")).toBe(false);
    expect(css).toMatch(/input, textarea, select\s*\{\s*max-width:\s*420px;/);
    expect(css).toMatch(/\[role="button"\], button\s*\{\s*max-width:\s*420px;/);
  });

  it("builds the generated Shop document before either OS launch mode", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts.dev).toBe(
      "node ../../scripts/build-shop.mjs && vite --host 127.0.0.1",
    );
    expect(packageJson.scripts.build).toBe(
      "node ../../scripts/build-shop.mjs && tsc --noEmit && vite build",
    );
  });
});

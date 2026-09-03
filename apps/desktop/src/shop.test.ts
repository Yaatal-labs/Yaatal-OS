import { describe, expect, it } from "vitest";

import { productPath, sanitizeNavigationEvent } from "./shop";

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
});
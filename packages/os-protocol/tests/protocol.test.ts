import { describe, expect, it } from "vitest";

import {
  OS_PROTOCOL_VERSION,
  sanitizeProductNavigation,
  sanitizeShopRefresh,
  sanitizeSidecarStatus,
} from "../src/index";

describe("OS protocol sanitizers", () => {
  it("keeps only a bounded product identifier with a studio origin", () => {
    expect(sanitizeProductNavigation({ kind: "product-navigation", productId: "  kaftan_42 ", source: "studio" })).toEqual({
      version: OS_PROTOCOL_VERSION,
      kind: "product-navigation",
      productId: "kaftan_42",
      source: "studio",
    });
    expect(sanitizeProductNavigation({ kind: "product-navigation", productId: "https://shop/?token=x", source: "studio" })).toBeNull();
    // Navigation must originate from Studio — the Shop window never sends it.
    expect(sanitizeProductNavigation({ kind: "product-navigation", productId: "kaftan_42", source: "shop" })).toBeNull();
    expect(sanitizeProductNavigation({ kind: "product-navigation", productId: "kaftan_42" })).toBeNull();
  });

  it("allows only refresh scopes understood by the shell", () => {
    expect(sanitizeShopRefresh({ kind: "shop-refresh", scope: "catalog" })).toEqual({
      version: OS_PROTOCOL_VERSION,
      kind: "shop-refresh",
      scope: "catalog",
    });
    expect(sanitizeShopRefresh({ kind: "shop-refresh", scope: "all" })).toBeNull();
  });

  it("removes raw error detail from sidecar status", () => {
    expect(
      sanitizeSidecarStatus({
        kind: "sidecar-status",
        state: "failed",
        isRunning: false,
        port: 8484,
        errorCode: "startup_timeout",
        transcript: "seller said something sensitive",
        url: "http://localhost:8484/?token=secret",
      }),
    ).toEqual({
      version: OS_PROTOCOL_VERSION,
      kind: "sidecar-status",
      state: "failed",
      isRunning: false,
      port: 8484,
      errorCode: "startup_timeout",
    });
    expect(sanitizeSidecarStatus({ kind: "sidecar-status", state: "ready", isRunning: true, port: 0 })).toBeNull();
  });
});

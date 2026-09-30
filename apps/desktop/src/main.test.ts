import { describe, expect, it } from "vitest";

import { sanitizeProductNavigation, sanitizeSidecarStatus } from "@yaatal/os-protocol";

describe("shell-facing protocol use", () => {
  it("does not accept a token-bearing product URL as a navigation identifier", () => {
    expect(sanitizeProductNavigation({ kind: "product-navigation", productId: "dress?token=secret" })).toBeNull();
  });

  it("accepts only status data safe for immediate rendering", () => {
    expect(
      sanitizeSidecarStatus({ kind: "sidecar-status", state: "ready", isRunning: true, port: 8484 }),
    ).toMatchObject({ state: "ready", port: 8484 });
  });
});

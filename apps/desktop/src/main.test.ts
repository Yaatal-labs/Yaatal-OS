import { describe, expect, it } from "vitest";

import { sanitizeProductNavigation, sanitizeSidecarStatus } from "@yaatal/os-protocol";
import {
  postStudioMessage,
  reconcileStudioReadyState,
  sanitizeStudioAuthMessage,
  sanitizeStudioBootstrapGrant,
  sanitizeStudioFrameOrigin,
  settleCoordinatedLogout,
} from "./main";

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

describe("native Studio session bridge", () => {
  it("accepts only a short-lived Studio-scoped nonce response", () => {
    const nonce = "A".repeat(43);
    expect(sanitizeStudioBootstrapGrant({ nonce, surface: "studio", expiresInSeconds: 90 })).toEqual({
      nonce,
      surface: "studio",
      expiresInSeconds: 90,
    });
    expect(sanitizeStudioBootstrapGrant({ nonce, surface: "shop", expiresInSeconds: 90 })).toBeNull();
    expect(sanitizeStudioBootstrapGrant({ nonce: "short", surface: "studio", expiresInSeconds: 90 })).toBeNull();
    expect(sanitizeStudioBootstrapGrant({ nonce, surface: "studio", expiresInSeconds: 91 })).toBeNull();
  });

  it("targets the exact loopback Studio origin and rejects wildcards", () => {
    const calls: unknown[][] = [];
    const target = { postMessage: (...values: unknown[]) => calls.push(values) } as unknown as Window;
    postStudioMessage(target, "http://127.0.0.1:8484", { kind: "studio-auth-logout" });
    expect(calls).toEqual([[{ kind: "studio-auth-logout" }, "http://127.0.0.1:8484"]]);
    expect(sanitizeStudioFrameOrigin("http://127.0.0.1:8484/dashboard/os.html")).toBe("http://127.0.0.1:8484");
    expect(sanitizeStudioFrameOrigin("https://evil.example/studio")).toBeNull();
    expect(() => postStudioMessage(target, "*", {})).toThrow("invalid Studio target origin");
  });

  it("accepts only sanitized ready/status messages and never a nonce echo", () => {
    expect(sanitizeStudioAuthMessage({ version: "yaatal-os.v1", kind: "studio-auth-ready" })).toEqual({
      kind: "studio-auth-ready",
    });
    expect(sanitizeStudioAuthMessage({
      version: "yaatal-os.v1",
      kind: "studio-auth-status",
      action: "bootstrap",
      ok: true,
    })).toMatchObject({ action: "bootstrap", ok: true });
    expect(sanitizeStudioAuthMessage({
      version: "yaatal-os.v1",
      kind: "studio-auth-status",
      action: "bootstrap",
      ok: true,
      nonce: "must-not-cross-back",
    })).toBeNull();
  });

  it("clears Engine credentials even when Studio cleanup fails", async () => {
    const calls: string[] = [];
    const result = await settleCoordinatedLogout(
      async () => { calls.push("engine"); },
      async () => { calls.push("studio"); return false; },
    );
    expect(calls.sort()).toEqual(["engine", "studio"]);
    expect(result).toEqual({ engineCleared: true, studioCleared: false });
  });

  it("cleans an unmounted Studio on remount without bootstrapping a logged-out shell", async () => {
    const logout = await settleCoordinatedLogout(
      async () => undefined,
      async () => false, // no mounted Studio frame could receive cleanup
    );
    expect(logout).toEqual({ engineCleared: true, studioCleared: false });

    const calls: string[] = [];
    const remount = await reconcileStudioReadyState(
      { engineAuthenticated: false, cleanupPending: true },
      async () => { calls.push("cleanup"); return true; },
      async () => { calls.push("bootstrap"); },
    );

    expect(calls).toEqual(["cleanup"]);
    expect(remount).toEqual({
      engineAuthenticated: false,
      cleanupPending: false,
      action: "cleanup",
    });
  });
});

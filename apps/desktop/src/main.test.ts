import { describe, expect, it } from "vitest";

import { sanitizeProductNavigation, sanitizeSidecarStatus } from "@yaatal/os-protocol";
import {
  deliverStudioBootstrapGrant,
  postStudioMessage,
  reconcileStudioReadyState,
  sanitizeStudioAuthMessage,
  sanitizeStudioBootstrapGrant,
  sanitizeStudioFrameOrigin,
  settleCoordinatedLogout,
  StudioLifecycleGate,
  StudioSyncCoordinator,
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
      lifecycle: 1,
      requestId: 2,
    })).toMatchObject({ action: "bootstrap", ok: true });
    expect(sanitizeStudioAuthMessage({
      version: "yaatal-os.v1",
      kind: "studio-auth-status",
      action: "bootstrap",
      ok: true,
      lifecycle: 1,
      requestId: 2,
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

  it("reconciles ready-before-session-restore and requests one fresh grant", async () => {
    let engineAuthenticated = false;
    let cleanupPending = true;
    let synchronized = false;
    let cleanupCalls = 0;
    let bootstrapCalls = 0;
    let releaseCleanup: (value: boolean) => void = () => undefined;
    let markCleanupStarted: () => void = () => undefined;
    const cleanupStarted = new Promise<void>((resolve) => { markCleanupStarted = resolve; });
    const cleanupResult = new Promise<boolean>((resolve) => { releaseCleanup = resolve; });

    const coordinator = new StudioSyncCoordinator(async () => {
      const result = await reconcileStudioReadyState(
        { engineAuthenticated, cleanupPending },
        async () => {
          cleanupCalls += 1;
          markCleanupStarted();
          return cleanupResult;
        },
        async () => { bootstrapCalls += 1; },
      );
      cleanupPending = result.cleanupPending;
      synchronized = result.action === "bootstrap";
    });

    const readyRun = coordinator.request();
    await cleanupStarted;
    engineAuthenticated = true;
    const restoreRun = coordinator.request();
    releaseCleanup(true);
    await Promise.all([readyRun, restoreRun]);

    expect(cleanupCalls).toBe(1);
    expect(bootstrapCalls).toBe(1);
    expect(engineAuthenticated).toBe(true);
    expect(cleanupPending).toBe(false);
    expect(synchronized).toBe(true);
  });

  it("invalidates a late grant response before logout transports start", async () => {
    const gate = new StudioLifecycleGate();
    gate.sessionChanged();
    const lifecycle = gate.frameReady();
    const ticket = gate.begin(lifecycle);
    expect(Boolean(ticket)).toBe(true);

    let releaseGrant: () => void = () => undefined;
    const grantResponse = new Promise<void>((resolve) => { releaseGrant = resolve; });
    let posted = 0;
    let authenticated = true;
    let cleanupPending = false;
    const request = ticket && deliverStudioBootstrapGrant(
      gate,
      ticket,
      async () => {
        await grantResponse;
        return { nonce: "A".repeat(43), surface: "studio", expiresInSeconds: 90 };
      },
      () => ({ authenticated, cleanupPending, lifecycle }),
      () => { posted += 1; },
    );

    // This is the first operation at logout start in the renderer.
    gate.sessionChanged();
    cleanupPending = true;
    authenticated = false;
    releaseGrant();
    expect(await request).toBe("stale");

    expect(posted).toBe(0);
  });

  it("invalidates old pending status and issues one request for a remounted frame", async () => {
    const gate = new StudioLifecycleGate();
    gate.sessionChanged();
    const firstLifecycle = gate.frameReady();
    const oldTicket = gate.begin(firstLifecycle);
    expect(Boolean(oldTicket)).toBe(true);

    const nextLifecycle = gate.frameReady();
    expect(oldTicket && gate.acceptsStatus(oldTicket.lifecycle, oldTicket.requestId)).toBe(false);

    const freshTicket = gate.begin(nextLifecycle);
    const duplicate = gate.begin(nextLifecycle);
    expect(Boolean(freshTicket)).toBe(true);
    expect(duplicate).toBeNull();
    let posted = 0;
    const outcome = freshTicket && await deliverStudioBootstrapGrant(
      gate,
      freshTicket,
      async () => ({ nonce: "B".repeat(43), surface: "studio", expiresInSeconds: 90 }),
      () => ({ authenticated: true, cleanupPending: false, lifecycle: nextLifecycle }),
      () => { posted += 1; },
    );
    expect(outcome).toBe("posted");
    expect(posted).toBe(1);
  });
});

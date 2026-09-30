import { describe, expect, it, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";
import { createNativeAdapter, createWorkspaceAdapter, sanitizeCatalogProduct, sanitizeSession, sanitizeStudioEvent, transportError } from "./native";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
describe("native adapter", () => {
  it("labels browser preview and rejects authentication without IPC", async () => {
    const call = vi.fn(); const adapter = createNativeAdapter(call, false);
    expect(await adapter.runtimeMode()).toBe("preview");
    await expect(adapter.login("email", "password")).rejects.toThrow("desktop app");
    expect(call).toHaveBeenCalledTimes(0);
  });
  it("requires the native unified flag and rejects unsupported mode payloads", async () => {
    await expect(createNativeAdapter(vi.fn().mockResolvedValue({ unified: false }), true).runtimeMode()).rejects.toThrow("does not support");
    await expect(createNativeAdapter(vi.fn().mockResolvedValue({ unified: true, token: "secret" }), true).runtimeMode()).rejects.toThrow("unsupported response");
    expect(await createNativeAdapter(vi.fn().mockResolvedValue({ unified: true }), true).runtimeMode()).toBe("native");
  });
  it("uses existing native commands and rejects credential-bearing responses", async () => {
    const call = vi.fn().mockResolvedValue({ authenticated: true, merchant_name: "Awa", verified: true });
    await createNativeAdapter(call, true).login("awa@example.com", "secret");
    expect(call).toHaveBeenCalledWith("os_login", { email: "awa@example.com", password: "secret" });
    expect(sanitizeSession({ authenticated: true, merchant_name: "Awa", verified: true, token: "secret" })).toBeNull();
    expect(sanitizeSession({ authenticated: "yes", merchant_name: null, verified: null })).toBeNull();
  });
  it("does not expose arbitrary native transport error contents", async () => {
    const adapter = createNativeAdapter(vi.fn().mockRejectedValue(new Error("secret-token")), true);
    await expect(adapter.sessionStatus()).rejects.toThrow("could not complete");
    let message = "";
    try { await adapter.sessionStatus(); } catch (error) { message = error instanceof Error ? error.message : String(error); }
    expect(message.includes("secret-token")).toBe(false);
  });
  it("surfaces fixed-contract error codes humanized, masks everything else", async () => {
    const adapter = createNativeAdapter(vi.fn().mockRejectedValue(new Error("authentication_required")), true);
    await expect(adapter.login("awa@example.com", "wrong")).rejects.toThrow("authentication required");
    expect(transportError(new Error("service_unavailable")).message).toBe("service unavailable");
    expect(transportError(new Error("Bearer eyJhbGciOi.abc")).message).toContain("could not complete");
    expect(transportError("state_conflict").message).toBe("state conflict");
    expect(transportError(new Error("")).message).toContain("could not complete");
  });
  it("sanitizes either event-registration failure and cleans up a partial subscription", async () => {
    const subscribe = createNativeAdapter(vi.fn(), true).subscribe;
    const onSidecar = vi.fn(); const onProduct = vi.fn(); const listener = vi.mocked(listen);
    listener.mockReset();
    listener.mockRejectedValueOnce(new Error("first-registration-token"));
    let firstMessage = "";
    try { await subscribe(onSidecar, onProduct); } catch (error) { firstMessage = error instanceof Error ? error.message : String(error); }
    expect(firstMessage).toContain("event service could not start");
    expect(firstMessage.includes("first-registration-token")).toBe(false);
    const stopSidecar = vi.fn();
    listener.mockResolvedValueOnce(stopSidecar).mockRejectedValueOnce(new Error("second-registration-token"));
    let message = "";
    try { await subscribe(onSidecar, onProduct); } catch (error) { message = error instanceof Error ? error.message : String(error); }
    expect(message).toContain("event service could not start");
    expect(message.includes("second-registration-token")).toBe(false);
    expect(stopSidecar).toHaveBeenCalledOnce();
    listener.mockReset();
    const firstStop = vi.fn(); const secondStop = vi.fn();
    listener.mockResolvedValueOnce(firstStop).mockResolvedValueOnce(secondStop).mockRejectedValueOnce(new Error("third-registration-token"));
    await expect(subscribe(onSidecar, onProduct, vi.fn())).rejects.toThrow("event service could not start");
    expect(firstStop).toHaveBeenCalledOnce(); expect(secondStop).toHaveBeenCalledOnce();
  });
  it("accepts only the exact projected Studio event schema and dispatches sanitized invalidations", async () => {
    expect(sanitizeStudioEvent({ version: "yaatal.studio.event.v1", kind: "session-state", isLive: true, sessionId: "live-1" })).toEqual({ version: "yaatal.studio.event.v1", kind: "session-state", isLive: true, sessionId: "live-1" });
    expect(sanitizeStudioEvent({ version: "yaatal.studio.event.v1", kind: "session-state", isLive: true })).toBeNull();
    expect(sanitizeStudioEvent({ version: "yaatal.studio.event.v1", kind: "conversions-changed", liveSessionId: "live-1", buyer: "private" })).toBeNull();
    expect(sanitizeStudioEvent({ version: "yaatal.studio.event.v1", kind: "audio", transcript: "private" })).toBeNull();
    const callbacks = new Map<string, (event: { payload: unknown }) => void>(); const stops = [vi.fn(), vi.fn(), vi.fn()];
    vi.mocked(listen).mockReset().mockImplementation(async (name, callback) => { callbacks.set(name, callback as (event: { payload: unknown }) => void); return stops[callbacks.size - 1]; });
    const onStudio = vi.fn(); const unsubscribe = await createNativeAdapter(vi.fn(), true).subscribe(vi.fn(), vi.fn(), onStudio);
    callbacks.get("yaatal://studio-event")?.({ payload: { version: "yaatal.studio.event.v1", kind: "conversions-changed", liveSessionId: "live-1" } });
    callbacks.get("yaatal://studio-event")?.({ payload: { version: "yaatal.studio.event.v1", kind: "conversions-changed", liveSessionId: "live-1", raw: "private" } });
    expect(onStudio).toHaveBeenCalledOnce();
    unsubscribe(); stops.forEach(stop => expect(stop).toHaveBeenCalledOnce());
  });
  it("normalizes bounded catalog data and preserves the distinction between absent and empty variants", () => {
    const base = { id: "robe-wax", name: "Robe Wax Bleue", priceFcfa: 12500, priceDisplay: "12,500 FCFA", stock: 4, stockStatus: "low_stock", images: ["https://media.example/robe.webp"] };
    expect(sanitizeCatalogProduct(base)).toEqual(base);
    expect(sanitizeCatalogProduct({ ...base, variants: [] })).toEqual({ ...base, variants: [] });
    expect(sanitizeCatalogProduct({ ...base, variants: Array.from({ length: 13 }, (_, index) => `V${index}`) })).toBeNull();
    expect(sanitizeCatalogProduct({ ...base, stock: 1.5 })).toBeNull();
    expect(sanitizeCatalogProduct({ ...base, priceFcfa: "12500" })).toBeNull();
    expect(sanitizeCatalogProduct({ ...base, token: "secret" })).toBeNull();
  });
  it("maps workspace commands and validates their bounded responses", async () => {
    const product = { id: "robe-wax", name: "Robe Wax Bleue", priceFcfa: 12500, priceDisplay: "12,500 FCFA", stock: 4, stockStatus: "low_stock", images: ["https://media.example/robe.webp"], variants: ["S", "M"] };
    const call = vi.fn(async (command: string) => {
      switch (command) {
        case "catalog_list": return { products: [product], total: 1, page: 2, perPage: 20 };
        case "catalog_product": return product;
        case "studio_session_bootstrap": return { authenticated: true };
        case "studio_session_state": case "studio_go_live": case "studio_stop_stream": return { isLive: true, sessionId: "live-1", startedAt: 1_789_000_000, sellerName: "Awa" };
        case "studio_product_queue": return { products: [product], source: "engine_live_session" };
        case "studio_status": return { health: "ok", ledgerAvailable: true, readiness: { status: "passed", steps: [{ name: "studio.ready", status: "passed", durationMs: 25 }] } };
        case "studio_create_commerce_intent": return { intentId: "intent-1", liveSessionId: "live-1", productId: "robe-wax", publicUrl: "https://shop.example/b/abc?src=copy", livestreamUrl: "https://shop.example/b/abc?src=livestream", whatsappUrl: "https://wa.me/?text=hello", telegramUrl: "https://t.me/share/url?url=https%3A%2F%2Fshop.example%2Fb%2Fabc&text=hello" };
        case "studio_conversions": return [{ version: "yaatal.commerce-receipt.v1", orderId: "order-1", productId: "robe-wax", productName: "Robe Wax Bleue", totalFcfa: 12500, paymentProvider: "wave", paymentStatus: "sandbox_paid", liveSessionId: "live-1", sourceChannel: "copy", deduplicated: false, quantity: 1, createdAt: "2026-09-10T00:00:00Z" }];
        case "open_commerce_link": return { publicUrl: "https://shop.example/b/abc", opened: true };
        default: throw new Error(`unexpected ${command}`);
      }
    });
    const adapter = createWorkspaceAdapter(call, true);
    expect(await adapter.catalog.list({ page: 2, category: "robes" })).toMatchObject({ total: 1, products: [{ variants: ["S", "M"] }] });
    await adapter.catalog.product("robe-wax"); await adapter.bootstrap(); await adapter.sessionState(); await adapter.goLive(); await adapter.stopStream(); await adapter.productQueue(); await adapter.status(); await adapter.createIntent("robe-wax"); expect(await adapter.conversions("live-1")).toHaveLength(1); expect(await adapter.openLink("intent-1", "copy")).toEqual({ publicUrl: "https://shop.example/b/abc", opened: true });
    expect(call).toHaveBeenCalledWith("catalog_list", { page: 2, category: "robes" });
    expect(call).toHaveBeenCalledWith("catalog_product", { productId: "robe-wax" });
    expect(call).toHaveBeenCalledWith("studio_session_bootstrap", undefined);
    expect(call).toHaveBeenCalledWith("studio_session_state", undefined);
    expect(call).toHaveBeenCalledWith("studio_go_live", undefined);
    expect(call).toHaveBeenCalledWith("studio_stop_stream", undefined);
    expect(call).toHaveBeenCalledWith("studio_product_queue", undefined);
    expect(call).toHaveBeenCalledWith("studio_status", undefined);
    expect(call).toHaveBeenCalledWith("studio_create_commerce_intent", { productId: "robe-wax" });
    expect(call).toHaveBeenCalledWith("studio_conversions", { liveSessionId: "live-1" });
    expect(call).toHaveBeenCalledWith("open_commerce_link", { intentId: "intent-1", channel: "copy" });
  });
  it("rejects malformed workspace payloads without passing raw data to callers", async () => {
    const adapter = createWorkspaceAdapter(vi.fn().mockResolvedValue({ products: [], total: 1.5, page: 1, perPage: 20, token: "secret" }), true);
    await expect(adapter.catalog.list()).rejects.toThrow("unsupported response");
    let message = "";
    try { await adapter.catalog.list(); } catch (error) { message = error instanceof Error ? error.message : String(error); }
    expect(message.includes("secret")).toBe(false);
  });
  it("rejects malformed or credential-bearing native link results", async () => {
    const malformed = createWorkspaceAdapter(vi.fn().mockResolvedValue({ publicUrl: "https://user:secret@shop.example/item", opened: "yes", extra: true }), true);
    await expect(malformed.openLink("intent-1", "telegram")).rejects.toThrow("unsupported response");
    const extra = createWorkspaceAdapter(vi.fn().mockResolvedValue({ publicUrl: "https://shop.example/item", opened: false, token: "secret" }), true);
    await expect(extra.openLink("intent-1", "livestream")).rejects.toThrow("unsupported response");
  });
});

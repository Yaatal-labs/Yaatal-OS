import { describe, expect, it, vi } from "vitest";
import { createNativeAdapter, sanitizeSession } from "./native";
describe("native adapter", () => {
  it("labels browser preview and rejects authentication without IPC", async () => {
    const call = vi.fn(); const adapter = createNativeAdapter(call, false);
    expect(await adapter.runtimeMode()).toBe("preview");
    await expect(adapter.login("email", "password")).rejects.toThrow("desktop app");
    expect(call).not.toHaveBeenCalled();
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
    await expect(adapter.sessionStatus()).rejects.not.toThrow("secret-token");
  });
});

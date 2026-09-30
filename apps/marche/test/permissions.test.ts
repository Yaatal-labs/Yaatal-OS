import { describe, expect, it } from "vitest";
import { assertDeclaredPermission, hasDeclaredPermission, PermissionDeniedError } from "../src/host/permissions";
import { InMemoryConsentStore } from "../src/host/consent";
import type { AppManifest } from "../src/manifest/types";

function manifestWith(permissions: AppManifest["permissions"]): AppManifest {
  return {
    id: "boutique-express",
    name: "Boutique Express",
    description: "Une boutique créée avec Créer.",
    icon: "/icons/marche-icon.svg",
    url: "https://boutique-express.example.com",
    category: "commerce",
    author: "Aissatou",
    permissions,
  };
}

describe("hasDeclaredPermission / assertDeclaredPermission", () => {
  it("is true only for a permission the manifest actually lists", () => {
    const manifest = manifestWith(["share"]);
    expect(hasDeclaredPermission(manifest, "share")).toBe(true);
    expect(hasDeclaredPermission(manifest, "identity")).toBe(false);
    expect(hasDeclaredPermission(manifest, "pay")).toBe(false);
  });

  it("assertDeclaredPermission throws PermissionDeniedError for an undeclared permission", () => {
    const manifest = manifestWith([]);
    expect(() => assertDeclaredPermission(manifest, "identity")).toThrow(PermissionDeniedError);
  });

  it("assertDeclaredPermission does not throw for a declared permission", () => {
    const manifest = manifestWith(["pay"]);
    expect(() => assertDeclaredPermission(manifest, "pay")).not.toThrow();
  });

  it("the thrown error names the app and the permission, without leaking anything else", () => {
    const manifest = manifestWith([]);
    try {
      assertDeclaredPermission(manifest, "identity");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PermissionDeniedError);
      const denied = error as PermissionDeniedError;
      expect(denied.code).toBe("permission_denied");
      expect(denied.appId).toBe("boutique-express");
      expect(denied.permission).toBe("identity");
    }
  });
});

describe("InMemoryConsentStore", () => {
  it("starts with nothing granted", () => {
    const store = new InMemoryConsentStore();
    expect(store.isGranted("boutique-express", "identity")).toBe(false);
  });

  it("remembers a grant, scoped to the exact app and permission", () => {
    const store = new InMemoryConsentStore();
    store.grant("boutique-express", "identity");
    expect(store.isGranted("boutique-express", "identity")).toBe(true);
    expect(store.isGranted("boutique-express", "share")).toBe(false);
    expect(store.isGranted("autre-app", "identity")).toBe(false);
  });
});

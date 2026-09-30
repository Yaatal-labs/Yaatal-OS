import { describe, expect, it } from "vitest";
import { validateAppManifest } from "../src/manifest/validate";

function validManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "boutique-express",
    name: "Boutique Express",
    description: "Une boutique créée avec Créer.",
    icon: "https://boutique-express.example.com/icon.svg",
    url: "https://boutique-express.example.com",
    category: "commerce",
    author: "Aissatou",
    permissions: ["identity", "share"],
    ...overrides,
  };
}

describe("validateAppManifest", () => {
  it("accepts a well-formed manifest", () => {
    const result = validateAppManifest(validManifest());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.id).toBe("boutique-express");
      expect(result.manifest.permissions).toEqual(["identity", "share"]);
    }
  });

  it("accepts a manifest that declares no permissions", () => {
    const result = validateAppManifest(validManifest({ permissions: [] }));
    expect(result.ok).toBe(true);
  });

  it("rejects a manifest that isn't an object", () => {
    expect(validateAppManifest("not an object").ok).toBe(false);
    expect(validateAppManifest(null).ok).toBe(false);
    expect(validateAppManifest(["array"]).ok).toBe(false);
  });

  it("rejects an unknown permission, and reports which one", () => {
    const result = validateAppManifest(validManifest({ permissions: ["identity", "admin"] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("admin"))).toBe(true);
    }
  });

  it("de-duplicates permissions and returns them in a stable order regardless of input order", () => {
    const result = validateAppManifest(validManifest({ permissions: ["share", "identity", "share"] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.permissions).toEqual(["identity", "share"]);
    }
  });

  it("rejects a non-https app URL", () => {
    const result = validateAppManifest(validManifest({ url: "http://boutique-express.example.com" }));
    expect(result.ok).toBe(false);
  });

  it("allows http only for a loopback host (local mini-app development)", () => {
    const result = validateAppManifest(validManifest({ url: "http://localhost:5173" }));
    expect(result.ok).toBe(true);
  });

  it("rejects a URL with embedded credentials", () => {
    const result = validateAppManifest(validManifest({ url: "https://user:pass@boutique-express.example.com" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed id", () => {
    for (const id of ["", "Boutique", "boutique express", "-boutique", "a"]) {
      const result = validateAppManifest(validManifest({ id }));
      expect(result.ok, `id "${id}" should be rejected`).toBe(false);
    }
  });

  it("rejects an empty name or a name that is too long", () => {
    expect(validateAppManifest(validManifest({ name: "" })).ok).toBe(false);
    expect(validateAppManifest(validManifest({ name: "x".repeat(81) })).ok).toBe(false);
  });

  it("accepts a root-relative icon path for bundled examples", () => {
    const result = validateAppManifest(validManifest({ icon: "/icons/marche-icon.svg" }));
    expect(result.ok).toBe(true);
  });

  it("rejects a protocol-relative icon (not a local path, not a valid app URL)", () => {
    const result = validateAppManifest(validManifest({ icon: "//evil.example/icon.svg" }));
    expect(result.ok).toBe(false);
  });

  it("collects every error at once, not just the first", () => {
    const result = validateAppManifest({ id: "", name: "", permissions: ["not-a-permission"] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(3);
    }
  });
});

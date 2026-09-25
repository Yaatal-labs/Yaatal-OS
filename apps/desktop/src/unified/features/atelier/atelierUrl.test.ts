import { describe, expect, it } from "vitest";
import { DEFAULT_ATELIER_URL, resolveAtelierUrl } from "./atelierUrl";

describe("resolveAtelierUrl", () => {
  it("defaults to the local Cloudflare OS when unset or blank", () => {
    expect(resolveAtelierUrl(undefined)).toBe(DEFAULT_ATELIER_URL);
    expect(resolveAtelierUrl("   ")).toBe(DEFAULT_ATELIER_URL);
  });

  it("allows plain HTTP only on loopback", () => {
    expect(resolveAtelierUrl("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787/");
    expect(resolveAtelierUrl("http://[::1]:8787/")).toBe("http://[::1]:8787/");
    expect(resolveAtelierUrl("http://atelier.example.com/")).toBeNull();
  });

  it("allows HTTPS anywhere", () => {
    expect(resolveAtelierUrl("https://atelier.example.com/")).toBe("https://atelier.example.com/");
  });

  it("rejects other schemes, credentials and unparsable input", () => {
    expect(resolveAtelierUrl("javascript:alert(1)")).toBeNull();
    expect(resolveAtelierUrl("file:///C:/secret")).toBeNull();
    expect(resolveAtelierUrl("https://user:pass@atelier.example.com/")).toBeNull();
    expect(resolveAtelierUrl("not a url")).toBeNull();
  });

  it("drops query strings and fragments so nothing sensitive rides on the address", () => {
    expect(resolveAtelierUrl("https://atelier.example.com/app?token=abc#jwt=x")).toBe("https://atelier.example.com/app");
  });
});

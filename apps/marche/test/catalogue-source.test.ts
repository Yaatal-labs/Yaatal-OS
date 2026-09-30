import { describe, expect, it } from "vitest";
import { loadCatalogue } from "../src/catalogue/catalogue";
import { resolveCatalogueSource, type FetchLike } from "../src/catalogue/source";

const LOCAL_APPS = [{ id: "local-app" }];
const REMOTE_APPS = [{ id: "remote-app" }];

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function failing(status: number) {
  return { ok: false, status, json: async () => ({}) };
}

/** Records every URL it was called with, and answers according to `handlers` (by exact URL); a
 *  handler that's a function called `throw`s instead of resolving, to simulate a network error. */
function fakeFetch(handlers: Record<string, ReturnType<typeof ok> | ReturnType<typeof failing> | "network-error">): {
  fetch: FetchLike;
  calls: string[];
} {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (input) => {
    calls.push(input);
    const handler = handlers[input];
    if (!handler) throw new Error(`unexpected fetch: ${input}`);
    if (handler === "network-error") throw new Error("network error");
    return handler;
  };
  return { fetch: fetchImpl, calls };
}

describe("resolveCatalogueSource", () => {
  it("fetches only the local catalogue when no catalogueUrl is configured", async () => {
    const { fetch, calls } = fakeFetch({ "./catalogue.json": ok(LOCAL_APPS) });
    const result = await resolveCatalogueSource(fetch, undefined);
    expect(result).toBe(LOCAL_APPS);
    expect(calls).toEqual(["./catalogue.json"]);
  });

  it("fetches the remote catalogue and unwraps {apps} when catalogueUrl is configured and reachable", async () => {
    const { fetch, calls } = fakeFetch({
      "https://marche-api.example.test/v1/catalogue": ok({ apps: REMOTE_APPS }),
    });
    const result = await resolveCatalogueSource(fetch, "https://marche-api.example.test");
    expect(result).toBe(REMOTE_APPS);
    expect(calls).toEqual(["https://marche-api.example.test/v1/catalogue"]); // never touched the local fallback
  });

  it("strips a trailing slash from catalogueUrl before appending /v1/catalogue", async () => {
    const { fetch, calls } = fakeFetch({
      "https://marche-api.example.test/v1/catalogue": ok({ apps: REMOTE_APPS }),
    });
    await resolveCatalogueSource(fetch, "https://marche-api.example.test///");
    expect(calls).toEqual(["https://marche-api.example.test/v1/catalogue"]);
  });

  it("falls back to the local catalogue on a remote network error", async () => {
    const { fetch, calls } = fakeFetch({
      "https://marche-api.example.test/v1/catalogue": "network-error",
      "./catalogue.json": ok(LOCAL_APPS),
    });
    const result = await resolveCatalogueSource(fetch, "https://marche-api.example.test");
    expect(result).toBe(LOCAL_APPS);
    expect(calls).toEqual(["https://marche-api.example.test/v1/catalogue", "./catalogue.json"]);
  });

  it("falls back to the local catalogue when the remote responds non-2xx", async () => {
    const { fetch } = fakeFetch({
      "https://marche-api.example.test/v1/catalogue": failing(500),
      "./catalogue.json": ok(LOCAL_APPS),
    });
    const result = await resolveCatalogueSource(fetch, "https://marche-api.example.test");
    expect(result).toBe(LOCAL_APPS);
  });

  it("falls back to the local catalogue when the remote body has no apps array", async () => {
    const { fetch } = fakeFetch({
      "https://marche-api.example.test/v1/catalogue": ok({ oops: "not the expected shape" }),
      "./catalogue.json": ok(LOCAL_APPS),
    });
    const result = await resolveCatalogueSource(fetch, "https://marche-api.example.test");
    expect(result).toBe(LOCAL_APPS);
  });

  it("rejects when both the remote and the local fallback fail", async () => {
    const { fetch } = fakeFetch({
      "https://marche-api.example.test/v1/catalogue": "network-error",
      "./catalogue.json": failing(404),
    });
    await expect(resolveCatalogueSource(fetch, "https://marche-api.example.test")).rejects.toThrow();
  });

  it("end-to-end with loadCatalogue: an invalid entry from the remote catalogue is dropped, the valid one kept", async () => {
    const validApp = {
      id: "app-distante-valide",
      name: "App Distante Valide",
      description: "Exemple distant valide.",
      icon: "/icons/marche-icon.svg",
      url: "https://distante-valide.example.com",
      category: "outils",
      author: "Créer",
      permissions: [],
    };
    const invalidApp = { id: "PAS UN ID VALIDE", permissions: ["admin"] }; // bad id, unknown permission, missing fields
    const { fetch } = fakeFetch({
      "https://marche-api.example.test/v1/catalogue": ok({ apps: [validApp, invalidApp] }),
    });
    const raw = await resolveCatalogueSource(fetch, "https://marche-api.example.test");
    const result = loadCatalogue(raw);
    expect(result.apps).toEqual([validApp]);
    expect(result.rejected).toHaveLength(1);
  });
});

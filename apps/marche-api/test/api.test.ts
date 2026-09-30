import { applyD1Migrations, createExecutionContext, env, waitOnExecutionContext, type D1Migration } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/index.js";
import type { AppManifest } from "../src/manifest.js";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
      PUBLISH_TOKEN: string;
      ADMIN_TOKEN: string;
    }
  }
}

const PUBLISH = `Bearer ${env.PUBLISH_TOKEN}`;
const ADMIN = `Bearer ${env.ADMIN_TOKEN}`;

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));

async function call(path: string, init: RequestInit & { auth?: string } = {}, extraEnv: Record<string, unknown> = {}) {
  const headers = new Headers(init.headers);
  if (init.auth) headers.set("authorization", init.auth);
  if (init.body) headers.set("content-type", "application/json");
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new Request(`https://marche-api.yaatal.test${path}`, { ...init, headers }),
    { ...env, ...extraEnv } as never,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

let counter = 0;
/** A valid manifest body as `Record<string, unknown>` (not the typed `AppManifest`) so tests can
 *  freely override a field with an invalid value to exercise validation. */
function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  counter += 1;
  return {
    id: `app-de-test-${counter}`,
    name: `App de Test ${counter}`,
    description: "Une app de test pour la file de revue.",
    icon: "/icons/marche-icon.svg",
    url: `https://app-test-${counter}.example.com`,
    category: "outils",
    author: "Créer (test)",
    permissions: [],
    ...overrides,
  };
}

async function publish(m: Record<string, unknown>, owner = "owner-1", auth = PUBLISH) {
  return call("/v1/listings", { method: "POST", auth, body: JSON.stringify({ manifest: m, owner }) });
}

describe("auth", () => {
  it("refuses /v1/listings with no Authorization header", async () => {
    const response = await call("/v1/listings", { method: "POST", body: JSON.stringify({ manifest: manifest(), owner: "o" }) });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { type: "unauthorized", message: expect.any(String) } });
  });

  it("refuses /v1/listings with the wrong (but long enough) token", async () => {
    const wrong = "Bearer this-is-not-the-right-token-but-it-is-long-enough";
    expect((await publish(manifest(), "o", wrong)).status).toBe(401);
  });

  it("refuses a configured token under 32 characters, even presented exactly", async () => {
    const ctx = createExecutionContext();
    const request = new Request("https://marche-api.yaatal.test/v1/listings", {
      method: "POST",
      headers: { authorization: "Bearer short-token", "content-type": "application/json" },
      body: JSON.stringify({ manifest: manifest(), owner: "o" }),
    });
    const response = await worker.fetch(request, { ...env, PUBLISH_TOKEN: "short-token" } as never, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });

  it("refuses every /v1/listings call when PUBLISH_TOKEN is unset -- never open", async () => {
    const response = await call(
      "/v1/listings",
      { method: "POST", auth: PUBLISH, body: JSON.stringify({ manifest: manifest(), owner: "o" }) },
      { PUBLISH_TOKEN: undefined },
    );
    expect(response.status).toBe(401);
  });

  it("refuses every /admin call when ADMIN_TOKEN is unset -- never open", async () => {
    const response = await call("/admin/listings", { auth: ADMIN }, { ADMIN_TOKEN: undefined });
    expect(response.status).toBe(401);
  });

  it("the publish token cannot reach any /admin route", async () => {
    expect((await call("/admin/listings", { auth: PUBLISH })).status).toBe(401);
    expect((await call("/admin/listings/whatever/approve", { method: "POST", auth: PUBLISH })).status).toBe(401);
    expect(
      (await call("/admin/listings/whatever/reject", { method: "POST", auth: PUBLISH, body: JSON.stringify({ reason: "x" }) })).status,
    ).toBe(401);
  });

  it("the admin token cannot reach /v1/listings routes", async () => {
    expect((await publish(manifest(), "o", ADMIN)).status).toBe(401);
    const created = (await (await publish(manifest())).json()) as { id: string };
    expect((await call(`/v1/listings/${created.id}`, { auth: ADMIN })).status).toBe(401);
  });
});

describe("validation", () => {
  it("rejects a malformed request body", async () => {
    expect((await call("/v1/listings", { method: "POST", auth: PUBLISH, body: "not json" })).status).toBe(400);
    expect((await call("/v1/listings", { method: "POST", auth: PUBLISH, body: JSON.stringify(["not", "an", "object"]) })).status).toBe(400);
  });

  it("rejects an invalid manifest with French messages, type invalid_manifest", async () => {
    const response = await publish(manifest({ id: "NOT VALID!!" }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { type: string; messages: string[] } };
    expect(body.error.type).toBe("invalid_manifest");
    expect(body.error.messages.length).toBeGreaterThan(0);
    expect(body.error.messages.some((m) => m.startsWith("id"))).toBe(true);
  });

  it("rejects an unknown permission inside an otherwise valid manifest", async () => {
    const response = await publish(manifest({ permissions: ["identity", "admin"] }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { type: string; messages: string[] } };
    expect(body.error.messages.some((m) => m.includes("admin"))).toBe(true);
  });

  it("rejects a missing or oversized owner", async () => {
    const missing = await call("/v1/listings", { method: "POST", auth: PUBLISH, body: JSON.stringify({ manifest: manifest() }) });
    expect(missing.status).toBe(400);
    const tooLong = await call("/v1/listings", {
      method: "POST",
      auth: PUBLISH,
      body: JSON.stringify({ manifest: manifest(), owner: "x".repeat(65) }),
    });
    expect(tooLong.status).toBe(400);
  });
});

describe("create / replace / id_taken", () => {
  it("creates a new listing as pending, 201", async () => {
    const m = manifest();
    const response = await publish(m, "owner-a");
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: m.id, status: "pending" });
  });

  it("replaces the manifest and resets to pending when the same owner republishes, 200", async () => {
    const m = manifest();
    await publish(m, "owner-a");
    await call(`/admin/listings/${m.id}/approve`, { method: "POST", auth: ADMIN });
    expect((await (await call(`/v1/listings/${m.id}`, { auth: PUBLISH })).json() as { status: string }).status).toBe("approved");

    const updated = { ...m, description: "Nouvelle description, mise à jour." };
    const response = await publish(updated, "owner-a");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: m.id, status: "pending" });

    const cat = (await (await call("/v1/catalogue")).json()) as { apps: AppManifest[] };
    expect(cat.apps.find((a) => a.id === m.id)).toBeUndefined(); // unapproved again, so gone from the catalogue
  });

  it("refuses a different owner publishing over an existing id, 409, and leaves the listing untouched", async () => {
    const m = manifest();
    await publish(m, "owner-a");
    const response = await publish({ ...m, name: "Hostile Takeover" }, "owner-b");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { type: "id_taken" } });

    const read = (await (await call(`/v1/listings/${m.id}`, { auth: PUBLISH })).json()) as { status: string };
    expect(read.status).toBe("pending"); // owner-a's original publish, never touched by the attempt
  });
});

describe("status reads", () => {
  it("404s on an unknown id", async () => {
    expect((await call("/v1/listings/does-not-exist", { auth: PUBLISH })).status).toBe(404);
  });

  it("returns id, status and updated_at; reason only once rejected", async () => {
    const m = manifest();
    await publish(m);
    const pending = (await (await call(`/v1/listings/${m.id}`, { auth: PUBLISH })).json()) as Record<string, unknown>;
    expect(pending).toMatchObject({ id: m.id, status: "pending" });
    expect(pending.reason).toBeUndefined();
    expect(typeof pending.updated_at).toBe("string");

    await call(`/admin/listings/${m.id}/reject`, {
      method: "POST",
      auth: ADMIN,
      body: JSON.stringify({ reason: "Ne respecte pas les règles de la boutique." }),
    });
    const rejected = (await (await call(`/v1/listings/${m.id}`, { auth: PUBLISH })).json()) as Record<string, unknown>;
    expect(rejected.status).toBe("rejected");
    expect(rejected.reason).toBe("Ne respecte pas les règles de la boutique.");
  });
});

describe("approve / reject", () => {
  it("approves a pending listing", async () => {
    const m = manifest();
    await publish(m);
    const response = await call(`/admin/listings/${m.id}/approve`, { method: "POST", auth: ADMIN });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { status: string }).status).toBe("approved");
  });

  it("requires a (French) reason to reject", async () => {
    const m = manifest();
    await publish(m);
    expect((await call(`/admin/listings/${m.id}/reject`, { method: "POST", auth: ADMIN, body: JSON.stringify({}) })).status).toBe(400);
    expect(
      (await call(`/admin/listings/${m.id}/reject`, { method: "POST", auth: ADMIN, body: JSON.stringify({ reason: "  " }) })).status,
    ).toBe(400);
  });

  it("404s approving or rejecting an unknown id", async () => {
    expect((await call("/admin/listings/nope/approve", { method: "POST", auth: ADMIN })).status).toBe(404);
    expect((await call("/admin/listings/nope/reject", { method: "POST", auth: ADMIN, body: JSON.stringify({ reason: "x" }) })).status).toBe(
      404,
    );
  });
});

describe("catalogue", () => {
  it("serves approved listings only, sorted by name, publicly, with caching and CORS headers", async () => {
    const zed = manifest({ id: "app-zed-test", name: "Zed App" });
    const alpha = manifest({ id: "app-alpha-test", name: "Alpha App" });
    const pendingOnly = manifest({ id: "app-pending-test", name: "Pending App" });
    const rejectedOnly = manifest({ id: "app-rejected-test", name: "Rejected App" });
    await publish(zed);
    await publish(alpha);
    await publish(pendingOnly);
    await publish(rejectedOnly);
    await call(`/admin/listings/${zed.id}/approve`, { method: "POST", auth: ADMIN });
    await call(`/admin/listings/${alpha.id}/approve`, { method: "POST", auth: ADMIN });
    await call(`/admin/listings/${rejectedOnly.id}/reject`, { method: "POST", auth: ADMIN, body: JSON.stringify({ reason: "x" }) });

    const response = await call("/v1/catalogue"); // no auth at all
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    const { apps } = (await response.json()) as { apps: AppManifest[] };
    const ids = [zed.id, alpha.id, pendingOnly.id, rejectedOnly.id];
    expect(apps.filter((a) => ids.includes(a.id)).map((a) => a.id)).toEqual([alpha.id, zed.id]);
  });
});

describe("admin review queue", () => {
  it("lists by status with owner and updated_at", async () => {
    const m = manifest();
    await publish(m, "owner-xyz");
    const response = await call("/admin/listings?status=pending", { auth: ADMIN });
    expect(response.status).toBe(200);
    const { listings } = (await response.json()) as { listings: { id: string; owner: string; status: string; updated_at: string }[] };
    const mine = listings.find((l) => l.id === m.id);
    expect(mine).toMatchObject({ id: m.id, owner: "owner-xyz", status: "pending" });
    expect(typeof mine?.updated_at).toBe("string");
  });

  it("rejects an invalid status filter", async () => {
    expect((await call("/admin/listings?status=bogus", { auth: ADMIN })).status).toBe(400);
  });
});

describe("routing", () => {
  it("404s anything not in the API", async () => {
    expect((await call("/")).status).toBe(404);
    expect((await call("/v1/listings", { auth: PUBLISH })).status).toBe(404); // GET, not POST
    expect((await call("/v1/catalogue", { method: "POST" })).status).toBe(404);
    expect((await call("/v1/listings/abc", { method: "DELETE", auth: PUBLISH })).status).toBe(404);
  });
});

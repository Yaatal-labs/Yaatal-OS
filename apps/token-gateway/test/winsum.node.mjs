// Run without dependency installation: node --experimental-transform-types --test test/winsum.node.mjs
// Fixtures assume a provisional OpenAI envelope; they are not live Winsum responses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverWinsum } from "../src/winsum.ts";
const env = { WINSUM_BASE_URL: "https://supplier.invalid", WINSUM_API_KEY: "server-secret-for-test" };
const good = () => Response.json({ object: "list", data: [{ object: "model", id: "assumed-model" }] });
const rejects = (config, fetcher, code) => assert.rejects(discoverWinsum(config, fetcher), error => error.code === code && !error.message.includes(env.WINSUM_API_KEY));
test("disabled configuration makes no request", async () => {
  await rejects({}, () => { throw Error("must not fetch"); }, "winsum_not_configured");
});
test("origin convention rejects paths, insecure URLs and embedded credentials", async () => {
  for (const url of ["http://supplier.invalid", "https://supplier.invalid/v1", "https://user:pass@supplier.invalid", "https://supplier.invalid/?x=1"]) {
    await rejects({ ...env, WINSUM_BASE_URL: url }, () => { throw Error("must not fetch"); }, "winsum_invalid_configuration");
  }
});
test("authenticated discovery uses only configured supplier credentials and refuses redirects", async () => {
  const result = await discoverWinsum(env, async (url, init) => {
    assert.equal(String(url), "https://supplier.invalid/v1/models");
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "manual");
    assert.equal(init.headers.authorization, `Bearer ${env.WINSUM_API_KEY}`);
    assert.equal(init.headers["content-type"], "application/json");
    assert.equal(init.headers.accept, "application/json");
    return good();
  });
  assert.deepEqual(result.model_ids, ["assumed-model"]);
  assert.equal(result.inference_enabled, false);
  await rejects(env, async () => new Response(null, { status: 302, headers: { location: "https://other.invalid" } }), "winsum_upstream_error");
});
test("unsupported schema, duplicate IDs and malformed JSON fail closed", async () => {
  for (const body of [{}, [], { object: "list", data: [{ id: "x" }] }, { object: "list", data: [{ object: "model", id: "x" }, { object: "model", id: "x" }] }]) {
    await rejects(env, async () => Response.json(body), "winsum_unsupported_schema");
  }
  await rejects(env, async () => new Response("{", { headers: { "content-type": "application/json" } }), "winsum_discovery_failed");
});
test("upstream errors and exception text never escape", async () => {
  await rejects(env, async () => new Response(env.WINSUM_API_KEY, { status: 401 }), "winsum_upstream_error");
  await rejects(env, async () => { throw Error(env.WINSUM_API_KEY); }, "winsum_discovery_failed");
});
test("oversized streamed responses are rejected", async () => {
  await rejects(env, async () => new Response(" ".repeat(256001), { headers: { "content-type": "application/json" } }), "winsum_response_too_large");
});
test("timeout aborts discovery and is sanitized", async () => {
  await rejects(env, async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(Error(env.WINSUM_API_KEY)), { once: true });
  }), "winsum_timeout");
});

test("gateway route requires full admin token before discovery; no configuration is a safe 503", async () => {
  // Match the Worker's .js specifiers to local TS sources without installing a compiler.
  const { registerHooks } = await import("node:module");
  const { existsSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("./") && specifier.endsWith(".js") && context.parentURL?.includes("/src/")) {
      const target = new URL(specifier.replace(/\.js$/, ".ts"), context.parentURL);
      if (existsSync(fileURLToPath(target))) return nextResolve(target.href, context);
    }
    return nextResolve(specifier, context);
  } });
  try {
    const { default: gateway } = await import("../src/index.ts");
    const admin = "a".repeat(40);
    const issuer = "i".repeat(40);
    const config = { ADMIN_TOKEN: admin, KEY_ISSUER_TOKEN: issuer, KEY_ISSUER_NAME: "test", CREDIT_TOKEN: "c".repeat(40) };
    for (const token of [null, issuer, config.CREDIT_TOKEN, "customer-key"]) {
      const response = await gateway.fetch(new Request("https://gateway.invalid/admin/suppliers/winsum/models", { headers: token ? { authorization: `Bearer ${token}` } : {} }), config, {});
      assert.equal(response.status, 401);
    }
    const response = await gateway.fetch(new Request("https://gateway.invalid/admin/suppliers/winsum/models", { headers: { authorization: `Bearer ${admin}` } }), config, {});
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "winsum_not_configured");
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => good();
      const discovered = await gateway.fetch(new Request("https://gateway.invalid/admin/suppliers/winsum/models", { headers: { authorization: `Bearer ${admin}` } }), { ...config, ...env }, {});
      assert.equal(discovered.status, 200);
      assert.equal(discovered.headers.get("cache-control"), "no-store");
      assert.equal((await discovered.json()).inference_enabled, false);
    } finally { globalThis.fetch = originalFetch; }
  } finally { hooks.deregister(); }
});

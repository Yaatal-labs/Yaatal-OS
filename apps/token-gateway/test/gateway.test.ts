import { applyD1Migrations, createExecutionContext, env, waitOnExecutionContext, type D1Migration } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../src/index.js";
import { MODELS, retailXof, USD_TO_XOF } from "../src/models.js";
import { callUpstreams } from "../src/upstream.js";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
      ADMIN_TOKEN: string;
      KEY_ISSUER_TOKEN: string;
      KEY_ISSUER_NAME: string;
    }
  }
}

const ADMIN = `Bearer ${env.ADMIN_TOKEN}`;
const ISSUER = `Bearer ${env.KEY_ISSUER_TOKEN}`;
const ISSUER_NAME = env.KEY_ISSUER_NAME;
const WHOLESALE_URL = "https://wholesale.example.test/v1";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
afterEach(() => vi.restoreAllMocks());

type Seen = { url: string; headers: Headers; body: Record<string, unknown> };

/** A fake Workers AI binding: records each request and answers with `respond`. */
function fakeAi(respond: (body: Record<string, unknown>) => Response) {
  const seen: Seen[] = [];
  const ai = {
    async fetch(url: string, init: RequestInit) {
      const body = JSON.parse(String(init.body));
      seen.push({ url, headers: new Headers(init.headers), body });
      return respond(body);
    },
  };
  return { ai, seen };
}

/** Replaces global fetch (the "openai"-kind upstreams) with a recorder. */
function fakeWholesale(respond: (body: Record<string, unknown>, url: string) => Response) {
  const seen: Seen[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const body = JSON.parse(String(init?.body));
    seen.push({ url: String(input), headers: new Headers(init?.headers), body });
    return respond(body, String(input));
  });
  return seen;
}

function completion(input: number, output: number, text = "Waaw, mangi fi.") {
  return Response.json({
    id: "c1",
    object: "chat.completion",
    model: "upstream-model",
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: input, completion_tokens: output, total_tokens: input + output },
  });
}

function sse(chunks: unknown[]) {
  const text = chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(text, { headers: { "content-type": "text/event-stream" } });
}

async function call(path: string, init: RequestInit & { auth?: string } = {}, extraEnv: Record<string, unknown> = {}) {
  const headers = new Headers(init.headers);
  if (init.auth) headers.set("authorization", init.auth);
  if (init.body) headers.set("content-type", "application/json");
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new Request(`https://tokens.yaatal.test${path}`, { ...init, headers }),
    { ...env, ...extraEnv } as never,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

async function newAccount(creditXof = 5_000, issuer?: string) {
  const response = await call("/admin/accounts", {
    method: "POST",
    auth: ADMIN,
    body: JSON.stringify({ name: "Agence Test", credit_xof: creditXof, ...(issuer !== undefined ? { issuer } : {}) }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { account: { id: string; issuer: string | null }; api_key: string; balance_xof: number };
}

async function balanceOf(key: string) {
  const response = await call("/v1/balance", { auth: `Bearer ${key}` });
  return (await response.json()) as {
    balance_xof: number;
    recent: { kind: string; amount_xof: number; model: string; input_tokens: number; output_tokens: number; estimated: boolean }[];
  };
}

const chatBody = (model: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ model, messages: [{ role: "user", content: "Salaam, naka nga def?" }], ...extra });

describe("catalog", () => {
  it("lists the models with FCFA prices, without a key", async () => {
    const response = await call("/v1/models");
    expect(response.headers.get("access-control-allow-origin")).toBe("*"); // readable from the Playground
    const { data } = (await response.json()) as { data: { id: string; tier: string; pricing: Record<string, unknown> }[] };
    expect(data.map(model => model.id)).toContain("kairmel/glm-4.7-flash");
    const glm = data.find(model => model.id === "kairmel/glm-4.7-flash")!;
    expect(glm.tier).toBe("micro");
    // Workers AI cost $0.0605 / $0.40 per million, at 600 FCFA per dollar and a 2x markup.
    expect(glm.pricing).toEqual({ currency: "XOF", input_per_million: 100, output_per_million: 500 });
  });
});

describe("keys and admin", () => {
  it("lets the key-issuer token mint and revoke keys on its own account, and nothing else", async () => {
    const { account } = await newAccount(1_000, ISSUER_NAME);
    const minted = await call(`/admin/accounts/${account.id}/keys`, {
      method: "POST", auth: ISSUER, body: JSON.stringify({ label: "app-demo" }),
    });
    expect(minted.status).toBe(201);
    const { key_id } = (await minted.json()) as { key_id: string };
    expect((await call(`/admin/keys/${key_id}`, { method: "DELETE", auth: ISSUER })).status).toBe(200);

    // Never money, accounts, issuer assignment or reports.
    const creditTry = await call(`/admin/accounts/${account.id}/credits`, {
      method: "POST", auth: ISSUER, body: JSON.stringify({ xof: 1_000_000, note: "x" }),
    });
    expect(creditTry.status).toBe(401);
    const accountTry = await call("/admin/accounts", { method: "POST", auth: ISSUER, body: JSON.stringify({ name: "x" }) });
    expect(accountTry.status).toBe(401);
    const issuerTry = await call(`/admin/accounts/${account.id}/issuer`, {
      method: "POST", auth: ISSUER, body: JSON.stringify({ issuer: ISSUER_NAME }),
    });
    expect(issuerTry.status).toBe(401);
    expect((await call("/admin/usage", { auth: ISSUER })).status).toBe(401);
  });

  it("reaches only accounts an admin assigned to it: another issuer's or an unassigned account 404s", async () => {
    const { account: mine } = await newAccount(1_000, ISSUER_NAME);
    const { account: theirs } = await newAccount(1_000, "another-issuer");
    const { account: unassigned } = await newAccount(1_000); // issuer omitted -> null, admin-only

    const minted = await call(`/admin/accounts/${mine.id}/keys`, {
      method: "POST", auth: ISSUER, body: JSON.stringify({ label: "app-demo" }),
    });
    expect(minted.status).toBe(201);

    for (const account of [theirs, unassigned]) {
      const response = await call(`/admin/accounts/${account.id}/keys`, {
        method: "POST", auth: ISSUER, body: JSON.stringify({ label: "app-demo" }),
      });
      expect(response.status).toBe(404);
    }
  });

  it("revokes only a key on an account assigned to it; another issuer's account 404s", async () => {
    const { account: mine } = await newAccount(1_000, ISSUER_NAME);
    const { account: theirs } = await newAccount(1_000, "another-issuer");
    const mintedMine = await call(`/admin/accounts/${mine.id}/keys`, {
      method: "POST", auth: ADMIN, body: JSON.stringify({ label: "app-a" }),
    });
    const { key_id: mineKeyId } = (await mintedMine.json()) as { key_id: string };
    const mintedTheirs = await call(`/admin/accounts/${theirs.id}/keys`, {
      method: "POST", auth: ADMIN, body: JSON.stringify({ label: "app-b" }),
    });
    const { key_id: theirsKeyId } = (await mintedTheirs.json()) as { key_id: string };

    expect((await call(`/admin/keys/${theirsKeyId}`, { method: "DELETE", auth: ISSUER })).status).toBe(404);
    const revokeMine = await call(`/admin/keys/${mineKeyId}`, { method: "DELETE", auth: ISSUER });
    expect(await revokeMine.json()).toEqual({ revoked: true });
  });

  it("refuses the key-issuer token entirely when KEY_ISSUER_NAME is unset, even with the right token", async () => {
    const { account } = await newAccount(1_000, ISSUER_NAME);
    const minted = await call(`/admin/accounts/${account.id}/keys`, {
      method: "POST", auth: ISSUER, body: JSON.stringify({ label: "x" }),
    }, { KEY_ISSUER_NAME: undefined });
    expect(minted.status).toBe(401);
  });

  it("lets only admin assign or clear an account's issuer, and still reaches every account itself", async () => {
    const { account } = await newAccount(1_000);
    expect(account.issuer).toBeNull();

    const refused = await call(`/admin/accounts/${account.id}/issuer`, {
      method: "POST", auth: ISSUER, body: JSON.stringify({ issuer: ISSUER_NAME }),
    });
    expect(refused.status).toBe(401);

    const assign = await call(`/admin/accounts/${account.id}/issuer`, {
      method: "POST", auth: ADMIN, body: JSON.stringify({ issuer: ISSUER_NAME }),
    });
    expect(await assign.json()).toEqual({ issuer: ISSUER_NAME });

    // Now assigned: the issuer token reaches it, and admin still mints on it directly too.
    expect((await call(`/admin/accounts/${account.id}/keys`, {
      method: "POST", auth: ISSUER, body: JSON.stringify({ label: "x" }),
    })).status).toBe(201);
    expect((await call(`/admin/accounts/${account.id}/keys`, {
      method: "POST", auth: ADMIN, body: JSON.stringify({ label: "y" }),
    })).status).toBe(201);

    const clear = await call(`/admin/accounts/${account.id}/issuer`, {
      method: "POST", auth: ADMIN, body: JSON.stringify({ issuer: null }),
    });
    expect(await clear.json()).toEqual({ issuer: null });
    expect((await call(`/admin/accounts/${account.id}/keys`, {
      method: "POST", auth: ISSUER, body: JSON.stringify({ label: "z" }),
    })).status).toBe(404);

    const badFormat = await call(`/admin/accounts/${account.id}/issuer`, {
      method: "POST", auth: ADMIN, body: JSON.stringify({ issuer: "Not Valid!" }),
    });
    expect(badFormat.status).toBe(400);

    const unknown = await call("/admin/accounts/00000000-0000-4000-8000-000000000000/issuer", {
      method: "POST", auth: ADMIN, body: JSON.stringify({ issuer: ISSUER_NAME }),
    });
    expect(unknown.status).toBe(404);
  });

  it("refuses admin calls without the admin token", async () => {
    for (const auth of [undefined, "Bearer wrong", `Bearer ${env.ADMIN_TOKEN}x`]) {
      const response = await call("/admin/accounts", { method: "POST", auth, body: JSON.stringify({ name: "x" }) });
      expect(response.status).toBe(401);
    }
  });

  it("creates an account with an opening credit and a key shown once, stored only as a hash", async () => {
    const { api_key, balance_xof, account } = await newAccount(5_000);
    expect(api_key).toMatch(/^yk_[A-Za-z0-9_-]{43}$/);
    expect(balance_xof).toBe(5_000);
    const stored = await env.DB.prepare("SELECT key_hash FROM api_keys WHERE account_id = ?").bind(account.id).all();
    expect(JSON.stringify(stored.results)).not.toContain(api_key);
  });

  it("rejects missing, malformed, unknown and revoked keys", async () => {
    const { api_key } = await newAccount();
    for (const auth of [undefined, "Bearer nope", "Bearer yk_unknown", `Basic ${api_key}`]) {
      expect((await call("/v1/balance", { auth })).status).toBe(401);
    }
    const revoke = await call("/admin/keys/revoke", { method: "POST", auth: ADMIN, body: JSON.stringify({ key: api_key }) });
    expect(await revoke.json()).toEqual({ revoked: true });
    expect((await call("/v1/balance", { auth: `Bearer ${api_key}` })).status).toBe(401);
  });

  it("gives an account a second, separately labelled key that shares its balance", async () => {
    const { account, api_key: firstKey, balance_xof } = await newAccount(1_000);
    const response = await call(`/admin/accounts/${account.id}/keys`, {
      method: "POST", auth: ADMIN, body: JSON.stringify({ label: "app-abc123" }),
    });
    expect(response.status).toBe(201);
    const { key_id, api_key: secondKey } = (await response.json()) as { key_id: string; api_key: string };
    expect(key_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondKey).toMatch(/^yk_[A-Za-z0-9_-]{43}$/);
    expect(secondKey).not.toBe(firstKey);
    // Both keys draw on the same balance.
    expect((await balanceOf(secondKey)).balance_xof).toBe(balance_xof);
    const stored = await env.DB.prepare("SELECT key_hash FROM api_keys WHERE account_id = ?").bind(account.id).all();
    expect(stored.results).toHaveLength(2);
    expect(JSON.stringify(stored.results)).not.toContain(secondKey);
  });

  it("404s creating a key for an unknown account", async () => {
    const response = await call("/admin/accounts/00000000-0000-4000-8000-000000000000/keys", {
      method: "POST", auth: ADMIN, body: JSON.stringify({ label: "x" }),
    });
    expect(response.status).toBe(404);
  });

  it("revokes one key by id without touching the account's other key", async () => {
    const { account, api_key: firstKey } = await newAccount(1_000);
    const created = await call(`/admin/accounts/${account.id}/keys`, {
      method: "POST", auth: ADMIN, body: JSON.stringify({ label: "app-def456" }),
    });
    const { key_id, api_key: secondKey } = (await created.json()) as { key_id: string; api_key: string };

    const revoke = await call(`/admin/keys/${key_id}`, { method: "DELETE", auth: ADMIN });
    expect(await revoke.json()).toEqual({ revoked: true });
    expect((await call("/v1/balance", { auth: `Bearer ${secondKey}` })).status).toBe(401);
    expect((await call("/v1/balance", { auth: `Bearer ${firstKey}` })).status).toBe(200);

    // Revoking the same id again changes nothing.
    const again = await call(`/admin/keys/${key_id}`, { method: "DELETE", auth: ADMIN });
    expect(await again.json()).toEqual({ revoked: false });
  });

  it("404s revoking an unknown key id and refuses without the admin token", async () => {
    const notFound = await call("/admin/keys/00000000-0000-4000-8000-000000000000", { method: "DELETE", auth: ADMIN });
    expect(notFound.status).toBe(200); // a well-formed id that matches nothing: not revoked, not an error
    expect(await notFound.json()).toEqual({ revoked: false });
    const { account } = await newAccount();
    const created = await call(`/admin/accounts/${account.id}/keys`, {
      method: "POST", auth: ADMIN, body: JSON.stringify({ label: "app-ghi789" }),
    });
    const { key_id } = (await created.json()) as { key_id: string };
    for (const auth of [undefined, "Bearer wrong"]) {
      expect((await call(`/admin/keys/${key_id}`, { method: "DELETE", auth })).status).toBe(401);
    }
  });

  it("credits an account and rejects bad amounts and unknown accounts", async () => {
    const { account, api_key } = await newAccount(1_000);
    const ok = await call(`/admin/accounts/${account.id}/credits`, {
      method: "POST", auth: ADMIN, body: JSON.stringify({ xof: 2_500, note: "Wave top-up ref W-1" }),
    });
    expect(await ok.json()).toEqual({ balance_xof: 3_500 });
    expect((await balanceOf(api_key)).balance_xof).toBe(3_500);
    for (const xof of [0, -5, 1.5, "100"]) {
      const bad = await call(`/admin/accounts/${account.id}/credits`, {
        method: "POST", auth: ADMIN, body: JSON.stringify({ xof, note: "x" }),
      });
      expect(bad.status).toBe(400);
    }
    const unknown = await call("/admin/accounts/00000000-0000-4000-8000-000000000000/credits", {
      method: "POST", auth: ADMIN, body: JSON.stringify({ xof: 10, note: "x" }),
    });
    expect(unknown.status).toBe(404);
  });
});

describe("chat completions", () => {
  it("bills reported usage at the model's FCFA price and returns the public model id", async () => {
    const { api_key } = await newAccount(5_000);
    const { ai, seen } = fakeAi(() => completion(1_000, 500));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/nemotron-3-super"),
    }, { AI: ai });
    expect(response.status).toBe(200);
    const json = (await response.json()) as { model: string; choices: unknown[] };
    expect(json.model).toBe("kairmel/nemotron-3-super");
    expect(seen[0]!.url).toContain("/workers-ai/v1/chat/completions");
    expect(seen[0]!.body.model).toBe("@cf/nvidia/nemotron-3-120b-a12b");
    // 1,000 input tokens at 600 FCFA/M plus 500 output tokens at 1,800 FCFA/M = 1.5 FCFA.
    const { balance_xof, recent } = await balanceOf(api_key);
    expect(balance_xof).toBeCloseTo(5_000 - 1.5, 6);
    expect(recent[0]).toMatchObject({ kind: "usage", amount_xof: -1.5, input_tokens: 1_000, output_tokens: 500, estimated: false });
  });

  it("keeps no data upstream: logging off, and no user, metadata or store fields forwarded", async () => {
    const { api_key } = await newAccount();
    const { ai, seen } = fakeAi(() => completion(10, 10));
    await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`,
      body: chatBody("kairmel/nemotron-3-super", { user: "customer-42", metadata: { phone: "+221" }, store: true }),
    }, { AI: ai });
    expect(seen[0]!.headers.get("cf-aig-collect-log")).toBe("false");
    for (const field of ["user", "metadata", "store"]) expect(seen[0]!.body).not.toHaveProperty(field);
    expect(JSON.stringify(seen[0])).not.toContain(api_key);
  });

  it("caps max_tokens at the model's limit", async () => {
    const { api_key } = await newAccount();
    const { ai, seen } = fakeAi(() => completion(1, 1));
    await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/nemotron-3-super", { max_completion_tokens: 1_000_000 }),
    }, { AI: ai });
    expect(seen[0]!.body.max_tokens).toBe(8192);
    expect(seen[0]!.body).not.toHaveProperty("max_completion_tokens");
  });

  it("streams bytes through unchanged and bills the usage from the final chunk", async () => {
    const { api_key } = await newAccount(5_000);
    const chunks = [
      { choices: [{ index: 0, delta: { content: "Mangi " } }] },
      { choices: [{ index: 0, delta: { content: "fi rekk." } }] },
      { choices: [], usage: { prompt_tokens: 2_000, completion_tokens: 1_000 } },
    ];
    const upstreamText = await sse(chunks).text();
    const { ai, seen } = fakeAi(() => sse(chunks));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/nemotron-3-super", { stream: true }),
    }, { AI: ai });
    expect(await response.text()).toBe(upstreamText);
    expect(seen[0]!.body.stream_options).toEqual({ include_usage: true });
    const { recent } = await balanceOf(api_key);
    // 2,000 input tokens at 600 FCFA/M plus 1,000 output tokens at 1,800 FCFA/M = 3 FCFA.
    expect(recent[0]).toMatchObject({ amount_xof: -3, input_tokens: 2_000, output_tokens: 1_000, estimated: false });
  });

  it("never reveals the upstream model in a stream", async () => {
    const { api_key } = await newAccount(5_000);
    const { ai } = fakeAi(() => sse([
      { model: "@cf/nvidia/nemotron-3-120b-a12b", choices: [{ index: 0, delta: { content: "Mangi fi." } }] },
      { model: "@cf/nvidia/nemotron-3-120b-a12b", choices: [], usage: { prompt_tokens: 10, completion_tokens: 3 } },
    ]));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/nemotron-3-super", { stream: true }),
    }, { AI: ai });
    const text = await response.text();
    expect(text).not.toContain("@cf/");
    expect(text.match(/"model":"kairmel\/nemotron-3-super"/g)).toHaveLength(2);
    expect(text).toContain("data: [DONE]");
  });

  it("estimates and flags a stream that reports no usage", async () => {
    const { api_key } = await newAccount();
    const { ai } = fakeAi(() => sse([{ choices: [{ index: 0, delta: { content: "x".repeat(400) } }] }]));
    await (await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/nemotron-3-super", { stream: true }),
    }, { AI: ai })).text();
    const { recent } = await balanceOf(api_key);
    expect(recent[0]).toMatchObject({ estimated: true, output_tokens: 100 });
  });
});

describe("leaked reasoning", () => {
  /** Joins every streamed delta's `field` for choice 0. */
  const streamed = (text: string, field: string) => text.split("\n")
    .filter(line => line.startsWith("data: {"))
    .map(line => (JSON.parse(line.slice(6)) as { choices?: { delta?: Record<string, string> }[] }).choices?.[0]?.delta?.[field] ?? "")
    .join("");

  it("moves reasoning before </think> out of a non-streamed answer, for any model", async () => {
    const { api_key } = await newAccount();
    const { ai } = fakeAi(() => completion(10, 10, "Le client veut 17 x 23, soit 391.</think>\n\n17 x 23 = 391."));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/nemotron-3-super"),
    }, { AI: ai });
    const { choices } = (await response.json()) as { choices: { message: Record<string, string> }[] };
    expect(choices[0]!.message.content).toBe("17 x 23 = 391.");
    expect(choices[0]!.message.reasoning_content).toBe("Le client veut 17 x 23, soit 391.");
  });

  it("leaves an answer without </think> as it is", async () => {
    const { api_key } = await newAccount();
    const { ai } = fakeAi(() => completion(10, 10, "Waaw, mangi fi."));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/nemotron-3-super"),
    }, { AI: ai });
    const { choices } = (await response.json()) as { choices: { message: Record<string, unknown> }[] };
    expect(choices[0]!.message).toEqual({ role: "assistant", content: "Waaw, mangi fi." });
  });

  it("holds a flagged model's stream until </think>, even when the tag is split across chunks", async () => {
    const { api_key } = await newAccount();
    const { ai } = fakeAi(() => sse([
      { choices: [{ index: 0, delta: { role: "assistant", content: "Il faut " } }] },
      { choices: [{ index: 0, delta: { content: "calculer.</thi" } }] },
      { choices: [{ index: 0, delta: { content: "nk>\n\n391." } }] },
      { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
      { choices: [], usage: { prompt_tokens: 10, completion_tokens: 12 } },
    ]));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/glm-5.3", { stream: true }),
    }, { AI: ai, WORKERS_PAID: "true" });
    const text = await response.text();
    expect(streamed(text, "content")).toBe("391.");
    expect(streamed(text, "reasoning_content")).toBe("Il faut calculer.");
    expect(text).not.toContain("think>");
    expect(text).toContain('"usage"');
    expect(text.trimEnd().endsWith("data: [DONE]")).toBe(true);
  });

  it("sends a flagged model's untagged stream whole, at the latest when the choice finishes", async () => {
    const { api_key } = await newAccount();
    const { ai } = fakeAi(() => sse([
      { choices: [{ index: 0, delta: { content: "Mangi " } }] },
      { choices: [{ index: 0, delta: { content: "fi rekk." }, finish_reason: "stop" }] },
    ]));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/glm-5.3", { stream: true }),
    }, { AI: ai, WORKERS_PAID: "true" });
    const text = await response.text();
    expect(streamed(text, "content")).toBe("Mangi fi rekk.");
    expect(streamed(text, "reasoning_content")).toBe("");
  });

  it("stops holding once the upstream sends its own reasoning field", async () => {
    const { api_key } = await newAccount();
    const { ai } = fakeAi(() => sse([
      { choices: [{ index: 0, delta: { reasoning_content: "Je calcule." } }] },
      { choices: [{ index: 0, delta: { content: "391." } }] },
      { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
    ]));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/glm-5.3", { stream: true }),
    }, { AI: ai, WORKERS_PAID: "true" });
    const text = await response.text();
    expect(streamed(text, "reasoning_content")).toBe("Je calcule.");
    expect(streamed(text, "content")).toBe("391.");
  });

  it("streams an unflagged model's bytes untouched, tag and all", async () => {
    const { api_key } = await newAccount();
    const chunks = [{ choices: [{ index: 0, delta: { content: "a</think>b" } }] }];
    const { ai } = fakeAi(() => sse(chunks));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/nemotron-3-super", { stream: true }),
    }, { AI: ai });
    expect(streamed(await response.text(), "content")).toBe("a</think>b");
  });
});

describe("failover", () => {
  it("falls back from a rate-limited wholesale upstream to Workers AI and bills once", async () => {
    const { api_key } = await newAccount(5_000);
    const wholesale = fakeWholesale(() => new Response("slow down", { status: 429 }));
    const { ai, seen } = fakeAi(() => completion(1_000, 1_000));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/glm-4.7-flash"),
    }, { AI: ai, WHOLESALE_BASE_URL: WHOLESALE_URL, WHOLESALE_API_KEY: "wk-test" });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-yaatal-failover")).toBe("1");
    expect(wholesale[0]!.url).toBe(`${WHOLESALE_URL}/chat/completions`);
    expect(wholesale[0]!.headers.get("authorization")).toBe("Bearer wk-test");
    expect(wholesale[0]!.body.model).toBe("glm-4.7-flash");
    expect(seen[0]!.body.model).toBe("@cf/zai-org/glm-4.7-flash");
    const { recent } = await balanceOf(api_key);
    expect(recent.filter(row => row.kind === "usage")).toHaveLength(1);
    expect(recent[0]!.amount_xof).toBeCloseTo(-0.6, 6); // 1,000 in at 100 + 1,000 out at 500 FCFA/M
  });

  it("sends nothing identifying the customer to the wholesale supplier", async () => {
    const { api_key, account } = await newAccount();
    const wholesale = fakeWholesale(() => completion(5, 5));
    await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/glm-4.7-flash", { user: "c-9" }),
    }, { AI: fakeAi(() => completion(1, 1)).ai, WHOLESALE_BASE_URL: WHOLESALE_URL });
    const sent = JSON.stringify({ ...wholesale[0], headers: [...wholesale[0]!.headers] });
    for (const secret of [api_key, account.id, "c-9"]) expect(sent).not.toContain(secret);
  });

  it("skips an unconfigured wholesale upstream without counting it as a failover", async () => {
    const { api_key } = await newAccount();
    const { ai } = fakeAi(() => completion(1, 1));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/glm-4.7-flash"),
    }, { AI: ai });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-yaatal-failover")).toBeNull();
  });

  it("answers 429 and charges nothing when every upstream is rate limited", async () => {
    const { api_key } = await newAccount(5_000);
    fakeWholesale(() => new Response("", { status: 429 }));
    const { ai } = fakeAi(() => new Response("", { status: 429 }));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/glm-4.7-flash"),
    }, { AI: ai, WHOLESALE_BASE_URL: WHOLESALE_URL });
    expect(response.status).toBe(429);
    const { balance_xof, recent } = await balanceOf(api_key);
    expect(balance_xof).toBe(5_000);
    expect(recent.filter(row => row.kind === "usage")).toHaveLength(0);
  });

  it("finds no upstream when the only one is an unconfigured wholesale server", async () => {
    const offer = { ...MODELS[0]!, upstreams: [{ kind: "openai", baseUrlVar: "WHOLESALE_BASE_URL", apiKeyVar: "WHOLESALE_API_KEY", model: "x" }] } as const;
    expect(await callUpstreams({ ...env, AI: fakeAi(() => completion(1, 1)).ai } as never, offer, { messages: [] })).toBeNull();
  });
});

describe("suppliers", () => {
  const SF = "https://sf.example.test/v1";
  const OR = "https://or.example.test/v1";
  const suppliers = {
    WORKERS_PAID: "true",
    SILICONFLOW_BASE_URL: SF, SILICONFLOW_API_KEY: "sf-test",
    OPENROUTER_BASE_URL: OR, OPENROUTER_API_KEY: "or-test",
  };
  const OR_ROUTING = { data_collection: "deny", max_price: { prompt: 0.25, completion: 0.7 } };

  it("serves DeepSeek V4 Flash from SiliconFlow first, billed at the public price", async () => {
    const { api_key } = await newAccount(5_000);
    const sent = fakeWholesale(() => completion(1_000, 1_000));
    const { ai, seen } = fakeAi(() => completion(1, 1));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/deepseek-v4-flash"),
    }, { AI: ai, ...suppliers });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { model: string }).model).toBe("kairmel/deepseek-v4-flash");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe(`${SF}/chat/completions`);
    expect(sent[0]!.headers.get("authorization")).toBe("Bearer sf-test");
    expect(sent[0]!.body.model).toBe("deepseek-ai/DeepSeek-V4-Flash");
    expect(seen).toHaveLength(0);
    const { recent } = await balanceOf(api_key);
    expect(recent[0]!.amount_xof).toBeCloseTo(-2.15, 6); // 1,000 in at 550 + 1,000 out at 1,600 FCFA/M
  });

  it("fails over to OpenRouter with a price cap and no host that keeps prompts", async () => {
    const { api_key } = await newAccount();
    const sent = fakeWholesale((_, url) => url.startsWith(SF) ? new Response("", { status: 429 }) : completion(5, 5));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/deepseek-v4-flash"),
    }, { AI: fakeAi(() => completion(1, 1)).ai, ...suppliers });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-yaatal-failover")).toBe("1");
    expect(sent[1]!.url).toBe(`${OR}/chat/completions`);
    expect(sent[1]!.headers.get("authorization")).toBe("Bearer or-test");
    expect(sent[1]!.body.model).toBe("deepseek/deepseek-v4-flash-0731");
    expect(sent[1]!.body.provider).toEqual(OR_ROUTING);
    expect(sent[0]!.body.provider).toBeUndefined();
  });

  it("forwards only standard chat fields, so a client cannot change the routing or add paid features", async () => {
    const { api_key } = await newAccount();
    const sent = fakeWholesale((_, url) => url.startsWith(SF) ? new Response("", { status: 503 }) : completion(5, 5));
    const tools = [{ type: "function", function: { name: "stock", parameters: { type: "object" } } }];
    await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/deepseek-v4-flash", {
        models: ["anthropic/claude-opus-5"], provider: { data_collection: "allow" }, route: "fallback",
        plugins: [{ id: "web" }], user: "c-9", temperature: 0.2, tools,
      }),
    }, { AI: fakeAi(() => completion(1, 1)).ai, ...suppliers });
    for (const { body } of sent) {
      for (const field of ["models", "route", "plugins", "user"]) expect(body).not.toHaveProperty(field);
      expect(body.temperature).toBe(0.2);
      expect(body.tools).toEqual(tools);
    }
    expect(sent[1]!.body.provider).toEqual(OR_ROUTING);
  });

  it("uses Workers AI when no supplier is configured", async () => {
    const { api_key } = await newAccount();
    const sent = fakeWholesale(() => completion(1, 1));
    const { ai, seen } = fakeAi(() => completion(1, 1));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/deepseek-v4-flash"),
    }, { AI: ai, WORKERS_PAID: "true" });
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(0);
    expect(seen[0]!.body.model).toBe("@cf/deepseek-ai/deepseek-v4-flash-0731");
    expect(response.headers.get("x-yaatal-failover")).toBeNull();
  });
});

describe("guards", () => {
  it("refuses an empty balance before calling any upstream", async () => {
    const { api_key, account } = await newAccount(1);
    await env.DB.prepare("UPDATE accounts SET balance_uxof = 0 WHERE id = ?").bind(account.id).run();
    const { ai, seen } = fakeAi(() => completion(1, 1));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/nemotron-3-super"),
    }, { AI: ai });
    expect(response.status).toBe(402);
    expect(seen).toHaveLength(0);
  });

  it("rejects unknown models, empty messages and non-JSON bodies without charging", async () => {
    const { api_key } = await newAccount(5_000);
    const auth = `Bearer ${api_key}`;
    expect((await call("/v1/chat/completions", { method: "POST", auth, body: chatBody("gpt-5") })).status).toBe(404);
    expect((await call("/v1/chat/completions", {
      method: "POST", auth, body: JSON.stringify({ model: "kairmel/glm-4.7-flash", messages: [] }),
    })).status).toBe(400);
    expect((await call("/v1/chat/completions", { method: "POST", auth, body: "{" })).status).toBe(400);
    expect((await balanceOf(api_key)).balance_xof).toBe(5_000);
  });
});

describe("customer pages", () => {
  it("shows the offer with prices from the catalog and names no supplier or upstream model", async () => {
    const response = await call("/");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Facturé en FCFA");
    expect(html).toContain("partout en zone UEMOA");
    expect(html).toContain("kairmel/qwen3.8-27b");
    expect(html).toMatch(/550<\/td><td class="num">3 850/); // qwen3.8-27b, the newest free-plan model
    for (const estimate of ["Ticket", "≈", "data-count"]) expect(html).not.toContain(estimate); // rates only, no estimates of ours
    expect(html).not.toContain("jetons");
    for (const word of ["siliconflow", "openrouter", "@cf/", "workers-ai", "wholesale"]) {
      expect(html.toLowerCase()).not.toContain(word);
    }
  });

  it("serves the pages with a strict content security policy", async () => {
    for (const path of ["/", "/usage"]) {
      const csp = (await call(path)).headers.get("content-security-policy") ?? "";
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain("unsafe-eval");
    }
    const usage = await call("/usage");
    const html = await usage.text();
    const nonce = /script-src 'nonce-([^']+)'/.exec(usage.headers.get("content-security-policy") ?? "")?.[1];
    expect(nonce).toBeTruthy();
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html).not.toContain("innerHTML");
  });

  it("puts the voice call first and reaches the voice Worker on this origin", async () => {
    const home = await call("/");
    const html = await home.text();
    expect(html).toContain('id="talk"');
    expect(html).toContain("Parler à Kairmel");
    expect(html).toContain('<dialog class="call-sheet" id="call"');
    const csp = home.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/script-src 'nonce-[^']+' 'self' blob:/); // the call's files, and its audio worklet
    expect(csp).toContain("connect-src 'self' wss://tokens.yaatal.test");
    expect(await (await call("/voix/embed.js")).text()).toBe("voice /embed.js");
    expect(await (await call("/agents/yaatal-voice/s1")).text()).toBe("voice /agents/yaatal-voice/s1");
    expect((await call("/agents/other/s1")).status).toBe(404);
    // Without the voice Worker: no call button, a stricter policy, nothing forwarded.
    const plain = await call("/", {}, { VOICE: undefined });
    expect(await plain.text()).not.toContain('id="talk"');
    expect(plain.headers.get("content-security-policy")).not.toContain("blob:");
    expect((await call("/voix/embed.js", {}, { VOICE: undefined })).status).toBe(404);
  });

  it("shows the WhatsApp button only for a valid configured number", async () => {
    expect(await (await call("/")).text()).not.toContain("wa.me");
    expect(await (await call("/", {}, { CONTACT_WHATSAPP: "221770000000" })).text()).toContain("https://wa.me/221770000000?text=");
    expect(await (await call("/", {}, { CONTACT_WHATSAPP: "javascript:alert(1)" })).text()).not.toContain("wa.me");
  });
});

describe("model ids", () => {
  it("still accepts the yaatal/ ids published before the product was named Kairmel", async () => {
    const { findModel } = await import("../src/models.js");
    expect(findModel("yaatal/glm-5.3")?.id).toBe("kairmel/glm-5.3");
    expect(findModel("kairmel/glm-5.3")?.id).toBe("kairmel/glm-5.3");
    expect(findModel("other/glm-5.3")).toBeUndefined();
  });
});

describe("playground hand-off", () => {
  it("with the call available but no builder, every idea opens the call and the hero has no form", async () => {
    const html = await (await call("/")).text();
    expect(html).not.toContain('name="prompt"');
    expect(html).toContain('data-idea="Je veux vendre mes tissus en ligne, en FCFA."');
    expect(html).toMatch(/<button class="tile" type="button" data-idea="/); // templates open the call too
  });

  it("with the builder configured, ideas go to the builder even when the call is bound", async () => {
    const html = await (await call("/", {}, { PLAYGROUND_URL: "https://os.yaatal.test" })).text();
    expect(html).toContain('name="prompt"');
    expect(html).not.toContain('id="talk"');
  });

  it("without the call, sends the idea to the Playground's prompt deep link, allowed by the form policy", async () => {
    const response = await call("/", {}, { VOICE: undefined, PLAYGROUND_URL: "https://os.yaatal.test", FEATURED_BLUEPRINT_ID: "8f3639f6abcdef12" });
    const html = await response.text();
    expect(html).toContain('<form class="ask reveal d3" method="get" action="https://os.yaatal.test/">');
    expect(html).toContain('name="prompt" maxlength="4000"');
    expect(html).toContain("https://os.yaatal.test/blueprint/8f3639f6abcdef12");
    expect(html).toContain("https://os.yaatal.test/");
    expect(response.headers.get("content-security-policy")).toContain("form-action https://os.yaatal.test");
  });

  it("refuses an unsafe Playground address and hides the form", async () => {
    for (const bad of ["http://os.yaatal.test", "javascript:alert(1)", "https://u:p@os.yaatal.test"]) {
      const response = await call("/", {}, { PLAYGROUND_URL: bad });
      const html = await response.text();
      expect(html).not.toContain('name="prompt"');
      expect(response.headers.get("content-security-policy")).toContain("form-action 'none'");
    }
  });

  it("ignores a malformed featured Blueprint id", async () => {
    const html = await (await call("/", {}, { PLAYGROUND_URL: "https://os.yaatal.test", FEATURED_BLUEPRINT_ID: "../admin" })).text();
    expect(html).not.toContain("/blueprint/");
  });
});

describe("photos", () => {
  it("shows real photos only alongside their licence credits", async () => {
    const html = await (await call("/")).text();
    for (const img of ["market", "wax", "tailor", "ngor"]) expect(html).toContain(`/img/${img}.webp`);
    for (const credit of ["Sanghesenegalafrica", "Lucas Takerkart", "dimworld", "GuillaumeG", "CC BY-SA 4.0", "CC BY 2.0"]) {
      expect(html).toContain(credit);
    }
    expect(html).not.toMatch(/<img(?![^>]*\balt=")[^>]*>/);
  });
});

describe("pricing", () => {
  it("never sells a model below its upstream cost", () => {
    expect(retailXof(3.2)).toBe(3850); // Qwen3.8 output: cost 1,920 FCFA
    for (const model of MODELS) {
      expect(model.inputXofPerMillion).toBeGreaterThan(0);
      expect(model.outputXofPerMillion).toBeGreaterThanOrEqual(model.inputXofPerMillion > 0 ? 50 : 0);
    }
  });
});

describe("supplier costs", () => {
  it("prices every model at or above what its dearest supplier can charge", () => {
    let checked = 0;
    for (const model of MODELS) {
      for (const upstream of model.upstreams) {
        if (upstream.kind !== "openai" || !upstream.maxCostUsd) continue;
        expect(model.inputXofPerMillion).toBeGreaterThanOrEqual(upstream.maxCostUsd.input * USD_TO_XOF);
        expect(model.outputXofPerMillion).toBeGreaterThanOrEqual(upstream.maxCostUsd.output * USD_TO_XOF);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("plan-gated models", () => {
  it("hides and refuses Workers Paid models on a free account, and serves them once enabled", async () => {
    const list = async (extra = {}) =>
      ((await (await call("/v1/models", {}, extra)).json()) as { data: { id: string }[] }).data.map(m => m.id);
    expect(await list()).not.toContain("kairmel/glm-5.3");
    expect(await list({ WORKERS_PAID: "true" })).toContain("kairmel/glm-5.3");
    const { api_key } = await newAccount();
    const refused = await call("/v1/chat/completions", { method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/glm-5.3") });
    expect(refused.status).toBe(404);
    const { ai } = fakeAi(() => completion(1, 1));
    const served = await call("/v1/chat/completions", { method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/glm-5.3") }, { AI: ai, WORKERS_PAID: "true" });
    expect(served.status).toBe(200);
    const page = await (await call("/")).text();
    expect(page).toContain('kairmel/glm-5.3</code> <span class="soon">bientôt</span>'); // listed, marked as coming
    expect(await (await call("/", {}, { WORKERS_PAID: "true" })).text()).not.toContain('class="soon"');
  });
});

describe("usage tracking", () => {
  type Report = {
    period: { days: number };
    accounts: { total: number; new: number; active: number; topped_up: number };
    credits: { count: number; xof: number };
    usage: { requests: number; input_tokens: number; output_tokens: number; spend_xof: number; estimated_share: number };
    refused: Record<"insufficient_balance" | "upstream_error" | "no_upstream", { count: number; accounts: number }>;
    by_model: { model: string; requests: number; spend_xof: number }[];
    by_account: { id: string; name: string; requests: number; spend_xof: number; balance_xof: number; last_used: string | null }[];
    daily: { day: string; new_accounts: number; requests: number; spend_xof: number; credits_xof: number }[];
  };
  const report = async (days = 30) => {
    const response = await call(`/admin/usage?days=${days}`, { auth: ADMIN });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    return (await response.json()) as Report;
  };

  it("is for the administrator only and checks the period", async () => {
    for (const auth of [undefined, "Bearer wrong-token-0123456789abcdef0123456789"]) {
      expect((await call("/admin/usage", { auth })).status).toBe(401);
    }
    for (const days of ["0", "367", "2.5", "abc"]) {
      expect((await call(`/admin/usage?days=${days}`, { auth: ADMIN })).status).toBe(400);
    }
  });

  it("counts sign-ups, credits, billed usage and spend per model, account and day", async () => {
    const before = await report();
    const { api_key, account } = await newAccount(2_000);
    const { ai } = fakeAi(() => completion(1_000, 500));
    for (let i = 0; i < 2; i++) {
      await call("/v1/chat/completions", { method: "POST", auth: `Bearer ${api_key}`, body: chatBody("kairmel/nemotron-3-super") }, { AI: ai });
    }
    const after = await report();
    expect(after.accounts.total - before.accounts.total).toBe(1);
    expect(after.accounts.new - before.accounts.new).toBe(1);
    expect(after.credits.count - before.credits.count).toBe(1);
    expect(after.credits.xof - before.credits.xof).toBe(2_000);
    expect(after.usage.requests - before.usage.requests).toBe(2);
    expect(after.usage.input_tokens - before.usage.input_tokens).toBe(2_000);
    expect(after.usage.spend_xof - before.usage.spend_xof).toBeCloseTo(3, 6); // 2 x 1.5 FCFA
    const mine = after.by_account.find(row => row.id === account.id)!;
    expect(mine).toMatchObject({ name: "Agence Test", requests: 2 });
    expect(mine.spend_xof).toBeCloseTo(3, 6);
    expect(mine.balance_xof).toBeCloseTo(1_997, 6);
    expect(mine.last_used).not.toBeNull();
    expect(after.by_model.find(row => row.model === "kairmel/nemotron-3-super")!.requests).toBeGreaterThanOrEqual(2);
    const today = new Date().toISOString().slice(0, 10);
    const day = after.daily.find(row => row.day === today)!;
    expect(day.new_accounts).toBeGreaterThanOrEqual(1);
    expect(day.credits_xof).toBeGreaterThanOrEqual(2_000);
  });

  it("records requests refused for an empty balance or a failed upstream, which never reach the ledger", async () => {
    const before = await report();
    const broke = await newAccount(1);
    await env.DB.prepare("UPDATE accounts SET balance_uxof = 0 WHERE id = ?").bind(broke.account.id).run();
    await call("/v1/chat/completions", { method: "POST", auth: `Bearer ${broke.api_key}`, body: chatBody("kairmel/nemotron-3-super") },
      { AI: fakeAi(() => completion(1, 1)).ai });
    const funded = await newAccount(5_000);
    await call("/v1/chat/completions", { method: "POST", auth: `Bearer ${funded.api_key}`, body: chatBody("kairmel/nemotron-3-super") },
      { AI: fakeAi(() => new Response("", { status: 500 })).ai });
    const after = await report();
    expect(after.refused.insufficient_balance.count - before.refused.insufficient_balance.count).toBe(1);
    expect(after.refused.upstream_error.count - before.refused.upstream_error.count).toBe(1);
    expect(after.usage.requests).toBe(before.usage.requests); // refused calls are not usage
    const events = await env.DB.prepare("SELECT account_id, kind, model FROM request_events WHERE account_id IN (?, ?)")
      .bind(broke.account.id, funded.account.id).all();
    expect(events.results).toEqual(expect.arrayContaining([
      { account_id: broke.account.id, kind: "insufficient_balance", model: "kairmel/nemotron-3-super" },
      { account_id: funded.account.id, kind: "upstream_error", model: "kairmel/nemotron-3-super" },
    ]));
  });
});

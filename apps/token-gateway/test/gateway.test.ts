import { applyD1Migrations, createExecutionContext, env, waitOnExecutionContext, type D1Migration } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../src/index.js";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
      ADMIN_TOKEN: string;
    }
  }
}

const ADMIN = `Bearer ${env.ADMIN_TOKEN}`;
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

/** Replaces global fetch (the wholesale upstream) with a recorder. */
function fakeWholesale(respond: (body: Record<string, unknown>) => Response) {
  const seen: Seen[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const body = JSON.parse(String(init?.body));
    seen.push({ url: String(input), headers: new Headers(init?.headers), body });
    return respond(body);
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

async function newAccount(creditFcfa = 5_000) {
  const response = await call("/admin/accounts", {
    method: "POST", auth: ADMIN, body: JSON.stringify({ name: "Agence Test", credit_fcfa: creditFcfa }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { account: { id: string }; api_key: string; balance_fcfa: number };
}

async function balanceOf(key: string) {
  const response = await call("/v1/balance", { auth: `Bearer ${key}` });
  return (await response.json()) as {
    balance_fcfa: number;
    recent: { kind: string; amount_fcfa: number; model: string; input_tokens: number; output_tokens: number; estimated: boolean }[];
  };
}

const chatBody = (model: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ model, messages: [{ role: "user", content: "Salaam, naka nga def?" }], ...extra });

describe("catalog", () => {
  it("lists the models with FCFA prices, without a key", async () => {
    const response = await call("/v1/models");
    const { data } = (await response.json()) as { data: { id: string; tier: string; pricing: Record<string, unknown> }[] };
    expect(data.map(model => model.id)).toContain("yaatal/glm-4.7-flash");
    const glm = data.find(model => model.id === "yaatal/glm-4.7-flash")!;
    expect(glm.tier).toBe("standard");
    expect(glm.pricing).toEqual({ currency: "XOF", input_per_million: 1000, output_per_million: 1000 });
  });
});

describe("keys and admin", () => {
  it("refuses admin calls without the admin token", async () => {
    for (const auth of [undefined, "Bearer wrong", `Bearer ${env.ADMIN_TOKEN}x`]) {
      const response = await call("/admin/accounts", { method: "POST", auth, body: JSON.stringify({ name: "x" }) });
      expect(response.status).toBe(401);
    }
  });

  it("creates an account with an opening credit and a key shown once, stored only as a hash", async () => {
    const { api_key, balance_fcfa, account } = await newAccount(5_000);
    expect(api_key).toMatch(/^yk_[A-Za-z0-9_-]{43}$/);
    expect(balance_fcfa).toBe(5_000);
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

  it("credits an account and rejects bad amounts and unknown accounts", async () => {
    const { account, api_key } = await newAccount(1_000);
    const ok = await call(`/admin/accounts/${account.id}/credits`, {
      method: "POST", auth: ADMIN, body: JSON.stringify({ fcfa: 2_500, note: "Wave top-up ref W-1" }),
    });
    expect(await ok.json()).toEqual({ balance_fcfa: 3_500 });
    expect((await balanceOf(api_key)).balance_fcfa).toBe(3_500);
    for (const fcfa of [0, -5, 1.5, "100"]) {
      const bad = await call(`/admin/accounts/${account.id}/credits`, {
        method: "POST", auth: ADMIN, body: JSON.stringify({ fcfa, note: "x" }),
      });
      expect(bad.status).toBe(400);
    }
    const unknown = await call("/admin/accounts/00000000-0000-4000-8000-000000000000/credits", {
      method: "POST", auth: ADMIN, body: JSON.stringify({ fcfa: 10, note: "x" }),
    });
    expect(unknown.status).toBe(404);
  });
});

describe("chat completions", () => {
  it("bills reported usage at the model's FCFA price and returns the public model id", async () => {
    const { api_key } = await newAccount(5_000);
    const { ai, seen } = fakeAi(() => completion(1_000, 500));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("yaatal/nemotron-3-super"),
    }, { AI: ai });
    expect(response.status).toBe(200);
    const json = (await response.json()) as { model: string; choices: unknown[] };
    expect(json.model).toBe("yaatal/nemotron-3-super");
    expect(seen[0]!.url).toContain("/workers-ai/v1/chat/completions");
    expect(seen[0]!.body.model).toBe("@cf/nvidia/nemotron-3-120b-a12b");
    // 1,500 tokens at 3,500 FCFA per million = 5.25 FCFA.
    const { balance_fcfa, recent } = await balanceOf(api_key);
    expect(balance_fcfa).toBeCloseTo(5_000 - 5.25, 6);
    expect(recent[0]).toMatchObject({ kind: "usage", amount_fcfa: -5.25, input_tokens: 1_000, output_tokens: 500, estimated: false });
  });

  it("keeps no data upstream: logging off, and no user, metadata or store fields forwarded", async () => {
    const { api_key } = await newAccount();
    const { ai, seen } = fakeAi(() => completion(10, 10));
    await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`,
      body: chatBody("yaatal/nemotron-3-super", { user: "customer-42", metadata: { phone: "+221" }, store: true }),
    }, { AI: ai });
    expect(seen[0]!.headers.get("cf-aig-collect-log")).toBe("false");
    for (const field of ["user", "metadata", "store"]) expect(seen[0]!.body).not.toHaveProperty(field);
    expect(JSON.stringify(seen[0])).not.toContain(api_key);
  });

  it("caps max_tokens at the model's limit", async () => {
    const { api_key } = await newAccount();
    const { ai, seen } = fakeAi(() => completion(1, 1));
    await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("yaatal/nemotron-3-super", { max_completion_tokens: 1_000_000 }),
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
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("yaatal/nemotron-3-super", { stream: true }),
    }, { AI: ai });
    expect(await response.text()).toBe(upstreamText);
    expect(seen[0]!.body.stream_options).toEqual({ include_usage: true });
    const { recent } = await balanceOf(api_key);
    // 3,000 tokens at 3,500 FCFA per million = 10.5 FCFA.
    expect(recent[0]).toMatchObject({ amount_fcfa: -10.5, input_tokens: 2_000, output_tokens: 1_000, estimated: false });
  });

  it("estimates and flags a stream that reports no usage", async () => {
    const { api_key } = await newAccount();
    const { ai } = fakeAi(() => sse([{ choices: [{ index: 0, delta: { content: "x".repeat(400) } }] }]));
    await (await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("yaatal/nemotron-3-super", { stream: true }),
    }, { AI: ai })).text();
    const { recent } = await balanceOf(api_key);
    expect(recent[0]).toMatchObject({ estimated: true, output_tokens: 100 });
  });
});

describe("failover", () => {
  it("falls back from a rate-limited wholesale upstream to Workers AI and bills once", async () => {
    const { api_key } = await newAccount(5_000);
    const wholesale = fakeWholesale(() => new Response("slow down", { status: 429 }));
    const { ai, seen } = fakeAi(() => completion(1_000, 1_000));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("yaatal/glm-4.7-flash"),
    }, { AI: ai, WHOLESALE_BASE_URL: WHOLESALE_URL, WHOLESALE_API_KEY: "wk-test" });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-yaatal-failover")).toBe("1");
    expect(wholesale[0]!.url).toBe(`${WHOLESALE_URL}/chat/completions`);
    expect(wholesale[0]!.headers.get("authorization")).toBe("Bearer wk-test");
    expect(wholesale[0]!.body.model).toBe("glm-4.7-flash");
    expect(seen[0]!.body.model).toBe("@cf/zai-org/glm-4.7-flash");
    const { recent } = await balanceOf(api_key);
    expect(recent.filter(row => row.kind === "usage")).toHaveLength(1);
    expect(recent[0]!.amount_fcfa).toBe(-2); // 2,000 tokens at 1,000 FCFA per million
  });

  it("sends nothing identifying the customer to the wholesale supplier", async () => {
    const { api_key, account } = await newAccount();
    const wholesale = fakeWholesale(() => completion(5, 5));
    await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("yaatal/glm-4.7-flash", { user: "c-9" }),
    }, { AI: fakeAi(() => completion(1, 1)).ai, WHOLESALE_BASE_URL: WHOLESALE_URL });
    const sent = JSON.stringify({ ...wholesale[0], headers: [...wholesale[0]!.headers] });
    for (const secret of [api_key, account.id, "c-9"]) expect(sent).not.toContain(secret);
  });

  it("skips an unconfigured wholesale upstream without counting it as a failover", async () => {
    const { api_key } = await newAccount();
    const { ai } = fakeAi(() => completion(1, 1));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("yaatal/glm-4.7-flash"),
    }, { AI: ai });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-yaatal-failover")).toBeNull();
  });

  it("answers 429 and charges nothing when every upstream is rate limited", async () => {
    const { api_key } = await newAccount(5_000);
    fakeWholesale(() => new Response("", { status: 429 }));
    const { ai } = fakeAi(() => new Response("", { status: 429 }));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("yaatal/glm-4.7-flash"),
    }, { AI: ai, WHOLESALE_BASE_URL: WHOLESALE_URL });
    expect(response.status).toBe(429);
    const { balance_fcfa, recent } = await balanceOf(api_key);
    expect(balance_fcfa).toBe(5_000);
    expect(recent.filter(row => row.kind === "usage")).toHaveLength(0);
  });

  it("answers 503 when a model has no configured upstream", async () => {
    const { api_key } = await newAccount();
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("yaatal/deepseek-r1"),
    }, { AI: fakeAi(() => completion(1, 1)).ai });
    expect(response.status).toBe(503);
  });
});

describe("guards", () => {
  it("refuses an empty balance before calling any upstream", async () => {
    const { api_key, account } = await newAccount(1);
    await env.DB.prepare("UPDATE accounts SET balance_ufcfa = 0 WHERE id = ?").bind(account.id).run();
    const { ai, seen } = fakeAi(() => completion(1, 1));
    const response = await call("/v1/chat/completions", {
      method: "POST", auth: `Bearer ${api_key}`, body: chatBody("yaatal/nemotron-3-super"),
    }, { AI: ai });
    expect(response.status).toBe(402);
    expect(seen).toHaveLength(0);
  });

  it("rejects unknown models, empty messages and non-JSON bodies without charging", async () => {
    const { api_key } = await newAccount(5_000);
    const auth = `Bearer ${api_key}`;
    expect((await call("/v1/chat/completions", { method: "POST", auth, body: chatBody("gpt-5") })).status).toBe(404);
    expect((await call("/v1/chat/completions", {
      method: "POST", auth, body: JSON.stringify({ model: "yaatal/glm-4.7-flash", messages: [] }),
    })).status).toBe(400);
    expect((await call("/v1/chat/completions", { method: "POST", auth, body: "{" })).status).toBe(400);
    expect((await balanceOf(api_key)).balance_fcfa).toBe(5_000);
  });
});

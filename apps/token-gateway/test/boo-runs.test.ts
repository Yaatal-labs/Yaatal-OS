import { applyD1Migrations, createExecutionContext, env, waitOnExecutionContext, type D1Migration } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../src/index.js";

declare global { namespace Cloudflare { interface Env { TEST_MIGRATIONS: D1Migration[]; ADMIN_TOKEN: string; } } }
const ADMIN = `Bearer ${env.ADMIN_TOKEN}`;
const BOO_ENV = { BOO_MODEL_ID: "kairmel/glm-4.7-flash", BOO_ALLOWED_TOOLS: "lookup_order" };

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));

async function call(path: string, init: RequestInit = {}, extra: Record<string, unknown> = {}) {
  const context = createExecutionContext();
  const response = await worker.fetch(new Request(`https://tokens.yaatal.test${path}`, init), { ...env, ...extra } as never, context);
  await waitOnExecutionContext(context);
  return response;
}

async function account(creditXof = 10) {
  const response = await call("/admin/accounts", {
    method: "POST", headers: { authorization: ADMIN, "content-type": "application/json" },
    body: JSON.stringify({ name: "Boo test", ...(creditXof > 0 ? { credit_xof: creditXof } : {}) }),
  });
  expect(response.status).toBe(201);
  return (await response.json() as { api_key: string }).api_key;
}

function requestBody(content = "Waaw") {
  return JSON.stringify({ model: BOO_ENV.BOO_MODEL_ID, messages: [{ role: "user", content }], max_output_tokens: 64, stream: false });
}

function fakeAi(respond: () => Response | Promise<Response>) {
  const fetch = vi.fn(async () => await respond());
  return { fetch };
}

describe("Boo bounded runs", () => {
  it("reserves once for concurrent identical keys and settles the canonical result", async () => {
    const key = await account();
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { finish = resolve; });
    const ai = fakeAi(() => pending);
    const first = call("/v1/boo/chat/completions", {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": "boo-run:one" }, body: requestBody(),
    }, { ...BOO_ENV, AI: ai });
    await vi.waitFor(() => expect(ai.fetch).toHaveBeenCalledTimes(1));
    const replay = await call("/v1/boo/chat/completions", {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": "boo-run:one" }, body: requestBody(),
    }, { ...BOO_ENV, AI: ai });
    expect(replay.status).toBe(202);
    finish(Response.json({ id: "completion-1", object: "chat.completion", model: "upstream", choices: [{ index: 0, message: { role: "assistant", content: "Waaw" }, finish_reason: "stop" }], usage: { prompt_tokens: 4, completion_tokens: 2 } }));
    const response = await first;
    expect(response.status).toBe(200);
    expect(ai.fetch).toHaveBeenCalledTimes(1);
    const again = await call("/v1/boo/chat/completions", {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": "boo-run:one" }, body: requestBody(),
    }, { ...BOO_ENV, AI: ai });
    expect(again.headers.get("idempotency-replayed")).toBe("true");
    expect(await again.json()).toEqual(await response.clone().json());
  });

  it("canonicalizes key order and token-limit aliases for idempotent replays", async () => {
    const key = await account();
    const ai = fakeAi(() => Response.json({ id: "canonical", model: "upstream", choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 1 } }));
    const headers = { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": "boo-run:canonical" };
    const first = await call("/v1/boo/chat/completions", { method: "POST", headers, body: requestBody() }, { ...BOO_ENV, AI: ai });
    expect(first.status).toBe(200);
    const equivalent = JSON.stringify({ max_tokens: 64, messages: [{ content: "Waaw", role: "user" }], model: BOO_ENV.BOO_MODEL_ID });
    const replay = await call("/v1/boo/chat/completions", { method: "POST", headers, body: equivalent }, { ...BOO_ENV, AI: ai });
    expect(replay.status).toBe(200);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(ai.fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects a conflicting body under the same account key", async () => {
    const key = await account();
    const ai = fakeAi(() => Response.json({ invalid: true }));
    const headers = { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": "boo-run:conflict" };
    const one = await call("/v1/boo/chat/completions", { method: "POST", headers, body: requestBody("first") }, { ...BOO_ENV, AI: ai });
    expect(one.status).toBe(202);
    const two = await call("/v1/boo/chat/completions", { method: "POST", headers, body: requestBody("changed") }, { ...BOO_ENV, AI: ai });
    expect(two.status).toBe(409);
    expect(ai.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects streaming before any reservation or upstream call", async () => {
    const key = await account();
    const ai = fakeAi(() => Response.json({}));
    const response = await call("/v1/boo/chat/completions", {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": "boo-run:stream" },
      body: JSON.stringify({ model: BOO_ENV.BOO_MODEL_ID, messages: [{ role: "user", content: "Waaw" }], stream: true }),
    }, { ...BOO_ENV, AI: ai });
    expect(response.status).toBe(400);
    expect(ai.fetch).not.toHaveBeenCalled();
  });

  it("keeps the reservation uncertain when usage is missing", async () => {
    const key = await account();
    const ai = fakeAi(() => Response.json({ id: "no-usage", model: "upstream", choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }] }));
    const response = await call("/v1/boo/chat/completions", {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": "boo-run:no-usage" }, body: requestBody(),
    }, { ...BOO_ENV, AI: ai });
    expect(response.status).toBe(202);
    expect(ai.fetch).toHaveBeenCalledTimes(1);
  });

  it("bounds completion reads and marks oversized responses uncertain", async () => {
    const key = await account();
    const ai = fakeAi(() => new Response("x".repeat(512 * 1024 + 1)));
    const response = await call("/v1/boo/chat/completions", {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": "boo-run:too-large" }, body: requestBody(),
    }, { ...BOO_ENV, AI: ai });
    expect(response.status).toBe(202);
    expect(ai.fetch).toHaveBeenCalledTimes(1);
  });
  it("refuses insufficient balance before any upstream call", async () => {
    const key = await account(0);
    const ai = fakeAi(() => Response.json({}));
    const response = await call("/v1/boo/chat/completions", {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": "boo-run:empty" }, body: requestBody(),
    }, { ...BOO_ENV, AI: ai });
    expect(response.status).toBe(402);
    expect(ai.fetch).not.toHaveBeenCalled();
  });

  it("settles actual usage and releases the unused reservation", async () => {
    const key = await account();
    const ai = fakeAi(() => Response.json({ id: "c2", object: "chat.completion", model: "upstream", choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 1 } }));
    const response = await call("/v1/boo/chat/completions", {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": "boo-run:settle" }, body: requestBody(),
    }, { ...BOO_ENV, AI: ai });
    expect(response.status).toBe(200);
    const balance = await call("/v1/balance", { headers: { authorization: `Bearer ${key}` } });
    const data = await balance.json() as { balance_xof: number; recent: { kind: string; amount_xof: number; model: string | null }[] };
    expect(data.balance_xof).toBeLessThan(10);
    expect(data.recent.some(row => row.kind === "usage" && row.model === BOO_ENV.BOO_MODEL_ID)).toBe(true);
    expect(data.recent.some(row => row.kind === "reservation" && row.model === BOO_ENV.BOO_MODEL_ID)).toBe(true);
  });

  it("retains an uncertain hold and never calls upstream again on retry", async () => {
    const key = await account();
    const ai = fakeAi(() => new Response("not-json", { headers: { "content-type": "application/json" } }));
    const headers = { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": "boo-run:uncertain" };
    const first = await call("/v1/boo/chat/completions", { method: "POST", headers, body: requestBody() }, { ...BOO_ENV, AI: ai });
    expect(first.status).toBe(202);
    const { id } = await first.json() as { id: string };
    const retry = await call("/v1/boo/chat/completions", { method: "POST", headers, body: requestBody() }, { ...BOO_ENV, AI: ai });
    expect(retry.status).toBe(202);
    expect(ai.fetch).toHaveBeenCalledTimes(1);
    const status = await call(`/v1/boo/runs/${id}`, { headers: { authorization: `Bearer ${key}` } }, { ...BOO_ENV, AI: ai });
    expect(status.status).toBe(202);
    expect(await status.json()).toMatchObject({ id, status: "uncertain" });
  });
});

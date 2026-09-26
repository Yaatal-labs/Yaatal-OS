// Yaatal Token Gateway: one OpenAI-compatible endpoint for every model Yaatal sells, billed in FCFA
// from a prepaid balance. Clients (the Yaatal OS, apps built on it, agencies' own code) use a Yaatal
// key; upstream keys never leave this Worker, and nothing identifying the customer goes upstream.
//
//   GET  /                              public page: offer, FCFA prices, quickstart, data handling
//   GET  /usage                         usage page (the key stays in the browser tab)
//   GET  /v1/models                     models and their FCFA prices
//   POST /v1/chat/completions           OpenAI chat completions, streaming or not
//   GET  /v1/balance                    the key's balance and recent ledger rows
//   POST /admin/accounts                {name, credit_fcfa?}  -> account + first key (shown once)
//   POST /admin/accounts/:id/keys       {label}               -> new key (shown once)
//   POST /admin/accounts/:id/credits    {fcfa, note}          -> new balance
//   POST /admin/keys/revoke             {key}
//
// Credits are granted by an administrator here. Taking payment (Wave, Orange Money, PI-SPI) is a
// separate, explicitly approved step that ends in one of these credit calls.
import { MODELS, costOf, findModel, type ModelOffer } from "./models.js";
import { UnknownAccountError, accountForKey, createAccount, createKey, credit, debitUsage, recentLedger, revokeKey } from "./ledger.js";
import { callUpstreams, type UpstreamEnv } from "./upstream.js";
import { home, usage, type SiteEnv } from "./site.js";
import { countStream, requestCharacters, usageFrom, generatedCharacters, estimateTokens } from "./usage.js";

export interface Env extends UpstreamEnv, SiteEnv {
  DB: D1Database;
  ADMIN_TOKEN?: string;
}

const MAX_BODY_BYTES = 2_000_000;
const UFCFA = 1_000_000;
/** Request fields that could store data or identify the end user upstream; never forwarded. */
const STRIPPED_FIELDS = ["user", "metadata", "store", "service_tier"] as const;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/" && request.method === "GET") return home(request, env);
      if (url.pathname === "/usage" && request.method === "GET") return usage();
      if (url.pathname === "/v1/models" && request.method === "GET") return models();
      if (url.pathname === "/v1/chat/completions" && request.method === "POST") return await chat(request, env, ctx);
      if (url.pathname === "/v1/balance" && request.method === "GET") return await balance(request, env);
      if (url.pathname.startsWith("/admin/") && request.method === "POST") return await admin(request, env, url.pathname);
      return error(404, "not_found", "No such route.");
    } catch (err) {
      if (err instanceof HttpError) return error(err.status, err.type, err.message);
      if (err instanceof UnknownAccountError) return error(404, "not_found", "No such account.");
      console.error("gateway error", err instanceof Error ? err.message : String(err));
      return error(500, "server_error", "The gateway failed; the request was not charged.");
    }
  },
} satisfies ExportedHandler<Env>;

class HttpError extends Error {
  constructor(readonly status: number, readonly type: string, message: string) {
    super(message);
  }
}

function error(status: number, type: string, message: string): Response {
  return Response.json({ error: { type, message } }, { status });
}

function models(): Response {
  return Response.json({
    object: "list",
    data: MODELS.map(model => ({
      id: model.id,
      object: "model",
      owned_by: "yaatal",
      tier: model.tier,
      pricing: {
        currency: "XOF",
        input_per_million: model.inputFcfaPerMillion,
        output_per_million: model.outputFcfaPerMillion,
      },
      max_output_tokens: model.maxOutputTokens,
    })),
  });
}

async function authenticate(request: Request, env: Env) {
  const header = request.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const account = key ? await accountForKey(env.DB, key) : null;
  if (!account) throw new HttpError(401, "invalid_api_key", "A valid Yaatal API key is required.");
  return account;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, "request_too_large", "Request body is too large.");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "request_too_large", "Request body is too large.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new HttpError(400, "invalid_request", "Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}

async function chat(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const account = await authenticate(request, env);
  const body = await readJson(request);
  const offer = findModel(body.model);
  if (!offer) throw new HttpError(404, "model_not_found", "Unknown model. GET /v1/models lists what is available.");
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new HttpError(400, "invalid_request", "messages must be a non-empty array.");
  }
  if (account.balanceUfcfa <= 0) {
    throw new HttpError(402, "insufficient_balance", "This account has no balance left. Top up to continue.");
  }

  const upstreamBody = prepare(body, offer);
  const result = await callUpstreams(env, offer, upstreamBody);
  if (!result) throw new HttpError(503, "no_upstream", "No upstream is configured for this model.");
  const { response, skipped } = result;
  const headers = new Headers({ "x-yaatal-model": offer.id });
  if (skipped) headers.set("x-yaatal-failover", String(skipped));

  // Upstream refused: pass its status on, uncharged.
  if (!response.ok) {
    await response.body?.cancel();
    return error(response.status === 429 ? 429 : 502, "upstream_error",
      `Every upstream for ${offer.id} is unavailable (last status ${response.status}). You were not charged.`);
  }

  const inputCharacters = requestCharacters(body);
  if (upstreamBody.stream === true && response.body) {
    const [client, meter] = response.body.tee();
    ctx.waitUntil(
      countStream(meter, inputCharacters).then(counts => charge(env, account.id, offer, counts)),
    );
    headers.set("content-type", response.headers.get("content-type") ?? "text/event-stream");
    headers.set("cache-control", "no-cache");
    return new Response(client, { status: 200, headers });
  }

  const completion = (await response.json()) as Record<string, unknown>;
  const reported = usageFrom(completion);
  const counts = reported
    ? { ...reported, estimated: false }
    : { inputTokens: estimateTokens(inputCharacters), outputTokens: estimateTokens(generatedCharacters(completion)), estimated: true };
  await charge(env, account.id, offer, counts);
  return Response.json({ ...completion, model: offer.id }, { headers });
}

/** The body sent upstream: public id swapped for the upstream's, output capped, usage requested. */
function prepare(body: Record<string, unknown>, offer: ModelOffer): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  for (const field of STRIPPED_FIELDS) delete out[field];
  const requested = out.max_completion_tokens ?? out.max_tokens;
  const cap = typeof requested === "number" && Number.isInteger(requested) && requested > 0
    ? Math.min(requested, offer.maxOutputTokens)
    : offer.maxOutputTokens;
  delete out.max_completion_tokens;
  out.max_tokens = cap;
  if (out.stream === true) out.stream_options = { include_usage: true };
  else delete out.stream_options;
  return out;
}

async function charge(env: Env, accountId: string, offer: ModelOffer,
                      counts: { inputTokens: number; outputTokens: number; estimated: boolean }) {
  await debitUsage(env.DB, accountId, {
    model: offer.id,
    inputTokens: counts.inputTokens,
    outputTokens: counts.outputTokens,
    costUfcfa: costOf(offer, counts.inputTokens, counts.outputTokens),
    estimated: counts.estimated,
  });
}

async function balance(request: Request, env: Env): Promise<Response> {
  const account = await authenticate(request, env);
  const rows = await recentLedger(env.DB, account.id);
  return Response.json({
    account: { id: account.id, name: account.name },
    balance_fcfa: account.balanceUfcfa / UFCFA,
    recent: rows.map(row => ({
      kind: row.kind,
      amount_fcfa: Number(row.amount_ufcfa) / UFCFA,
      model: row.model,
      input_tokens: row.input_tokens,
      output_tokens: row.output_tokens,
      estimated: row.estimated === 1,
      note: row.note,
      at: row.created_at,
    })),
  });
}

async function admin(request: Request, env: Env, path: string): Promise<Response> {
  if (!(await isAdmin(request, env))) throw new HttpError(401, "unauthorized", "Admin token required.");
  const body = await readJson(request);

  if (path === "/admin/accounts") {
    const name = text(body.name, "name");
    const account = await createAccount(env.DB, name);
    const key = await createKey(env.DB, account.id, "default");
    const creditFcfa = body.credit_fcfa === undefined ? 0 : fcfa(body.credit_fcfa);
    const balanceUfcfa = creditFcfa ? await credit(env.DB, account.id, creditFcfa * UFCFA, "opening credit") : 0;
    return Response.json({ account: { id: account.id, name }, api_key: key, balance_fcfa: balanceUfcfa / UFCFA }, { status: 201 });
  }
  if (path === "/admin/keys/revoke") {
    return Response.json({ revoked: await revokeKey(env.DB, text(body.key, "key")) });
  }
  const match = /^\/admin\/accounts\/([0-9a-f-]{36})\/(keys|credits)$/.exec(path);
  if (match) {
    const [, accountId, action] = match as unknown as [string, string, string];
    if (action === "keys") {
      const key = await createKey(env.DB, accountId, text(body.label, "label"));
      return Response.json({ api_key: key }, { status: 201 });
    }
    const amount = fcfa(body.fcfa);
    const balanceUfcfa = await credit(env.DB, accountId, amount * UFCFA, text(body.note, "note"));
    return Response.json({ balance_fcfa: balanceUfcfa / UFCFA });
  }
  throw new HttpError(404, "not_found", "No such admin route.");
}

async function isAdmin(request: Request, env: Env): Promise<boolean> {
  const expected = env.ADMIN_TOKEN;
  const header = request.headers.get("authorization") ?? "";
  if (!expected || expected.length < 32 || !header.startsWith("Bearer ")) return false;
  // Compare digests so the comparison takes the same time whatever the input.
  const [a, b] = await Promise.all([digest(header.slice(7)), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw new HttpError(400, "invalid_request", `${field} must be 1 to 200 characters.`);
  }
  return value.trim();
}

function fcfa(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 1_000_000_000) {
    throw new HttpError(400, "invalid_request", "fcfa must be a whole number of FCFA, 1 to 1,000,000,000.");
  }
  return value;
}

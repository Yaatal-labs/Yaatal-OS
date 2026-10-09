// Yaatal Token Gateway: one OpenAI-compatible endpoint for every model Yaatal sells, billed in XOF (FCFA)
// from a prepaid balance. Clients (the Yaatal OS, apps built on it, agencies' own code) use a Yaatal
// key; upstream keys never leave this Worker, and nothing identifying the customer goes upstream.
//
//   GET  /                              public page: offer, FCFA prices, quickstart, data handling
//   GET  /usage                         usage page (the key stays in the browser tab)
//   *    /voix/*, /agents/yaatal-voice/*  the voice call, served by the yaatal-voice Worker (VOICE binding)
//   GET  /v1/models                     models and their FCFA prices
//   POST /v1/chat/completions           OpenAI chat completions, streaming or not
//   GET  /v1/balance                    the key's balance and recent ledger rows
//   POST /admin/accounts                {name, credit_xof?, issuer?}  -> account + first key (shown once)
//   POST /admin/accounts/:id/keys       {label}               -> another key on the account (shown once)
//   POST /admin/accounts/:id/credits    {xof, note, payment_ref?}  -> new balance, and whether it was applied
//   POST /admin/accounts/:id/issuer     {issuer|null}        assign/clear which issuer may mint or revoke its keys
//   POST /admin/keys/revoke             {key}                revoke by raw key
//   DELETE /admin/keys/:id                                   revoke by key id (no raw key needed)
//   The two key routes also accept KEY_ISSUER_TOKEN, a narrower token for a platform that mints
//   per-app keys: it cannot create accounts, add credit, read reports, or touch an account that
//   isn't assigned (accounts.issuer) to its own KEY_ISSUER_NAME -- that account 404s, same as one
//   that doesn't exist. KEY_ISSUER_NAME unset refuses the token entirely.
//   GET  /admin/usage?days=30           sign-ups, credits, usage, refused requests, per model/account/day
//
// An account may hold several keys (one per app it operates, say): each is labelled at creation and
// revocable on its own, without touching the others or the account's balance.
//
// Credits are granted by an administrator here. Taking payment (Wave, Orange Money, PI-SPI) is a
// separate, explicitly approved step that ends in one of these credit calls. That step should send
// the settlement's own id as payment_ref: a credit citing a reference is applied once per account, so
// a replayed webhook or a bridge that retried after a timeout cannot pay the same settlement twice.
import { allowsDataClass, availableModels, costOf, DATA_CLASSES, findModel, type DataClass, type ModelOffer } from "./models.js";
import {
  PaymentRefConflictError, UnknownAccountError, accountByPid, accountForKey, accountIssuer, createAccount, createKey, credit, debitUsage,
  keyAccountIssuer, recentLedger, revokeKey, revokeKeyById, setAccountIssuer, upsertAccountByPid,
} from "./ledger.js";
import { callUpstreams, type UpstreamEnv } from "./upstream.js";
import { home, usage, type SiteEnv } from "./site.js";
import { countStream, requestCharacters, usageFrom, generatedCharacters, estimateTokens } from "./usage.js";
import { recordEvent, usageReport } from "./report.js";
import { moveThinking, thinkingOutOfStream } from "./think.js";
import { repairToolCalls, separateToolCalls, splitToolCalls } from "./tool-calls.js";

export interface Env extends UpstreamEnv, SiteEnv {
  DB: D1Database;
  /** "true" once the account is on Workers Paid: unlocks the models that need it. */
  WORKERS_PAID?: string;
  ADMIN_TOKEN?: string;
  /**
   * Narrower token for a platform that mints and revokes keys for its users: no credits, no
   * accounts, and only on accounts an admin has assigned (accounts.issuer) to KEY_ISSUER_NAME.
   */
  KEY_ISSUER_TOKEN?: string;
  /** Which accounts.issuer value KEY_ISSUER_TOKEN may act on. Unset refuses the token entirely. */
  KEY_ISSUER_NAME?: string;
  /**
   * The settlement bridge's credential: it may credit an account (with a payment_ref, always) and look
   * up an account by Engine pid, and call nothing else. Unset refuses the token entirely.
   */
  CREDIT_TOKEN?: string;
}

const MAX_BODY_BYTES = 2_000_000;
const UXOF = 1_000_000;
/** Request fields that could store data or identify the end user upstream; never forwarded. */
const STRIPPED_FIELDS = ["user", "metadata", "store", "service_tier"] as const;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (env.VOICE && (url.pathname.startsWith("/agents/yaatal-voice/") || url.pathname.startsWith("/voix/"))) {
        return await voiceRoute(request, env.VOICE, url);
      }
      if (url.pathname === "/" && request.method === "GET") return home(request, env);
      if (url.pathname === "/usage" && request.method === "GET") return usage(request, env);
      if (url.pathname === "/v1/models" && request.method === "GET") return models(env);
      if (url.pathname === "/v1/chat/completions" && request.method === "POST") return await chat(request, env, ctx);
      if (url.pathname === "/v1/balance" && request.method === "GET") return await balance(request, env);
      if (url.pathname === "/admin/usage" && request.method === "GET") return await usageAdmin(request, env, url);
      if (url.pathname.startsWith("/admin/accounts/by-pid/") && request.method === "GET") {
        return await adminGetByPid(request, env, url.pathname);
      }
      if (url.pathname.startsWith("/admin/") && request.method === "POST") return await admin(request, env, url.pathname);
      if (url.pathname.startsWith("/admin/accounts/by-pid/") && request.method === "PUT") {
        return await adminUpsertByPid(request, env, url.pathname);
      }
      if (url.pathname.startsWith("/admin/") && request.method === "DELETE") return await adminDelete(request, env, url.pathname);
      return error(404, "not_found", "No such route.");
    } catch (err) {
      if (err instanceof HttpError) return error(err.status, err.type, err.message);
      if (err instanceof UnknownAccountError) return error(404, "not_found", "No such account.");
      if (err instanceof PaymentRefConflictError) {
        return error(409, "payment_ref_conflict", "This payment already funded another account.");
      }
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
  return Response.json({ error: { type, code: type, message } }, { status });
}

function models(env: Env): Response {
  return Response.json({
    object: "list",
    data: availableModels(env).map(model => ({
      id: model.id,
      object: "model",
      owned_by: "yaatal",
      tier: model.tier,
      pricing: {
        currency: "XOF",
        input_per_million: model.inputXofPerMillion,
        output_per_million: model.outputXofPerMillion,
      },
      max_output_tokens: model.maxOutputTokens,
      residency: model.residency,
    })),
  }, {
    // Public price list: any page may read it (the Playground's "Add AI Model" lists these).
    headers: { "access-control-allow-origin": "*" },
  });
}

async function authenticate(request: Request, env: Env) {
  const header = request.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const account = key ? await accountForKey(env.DB, key) : null;
  if (!account) throw new HttpError(401, "invalid_api_key", "A valid Yaatal API key is required.");
  return account;
}

/** x-yaatal-data-class: absent means operational; anything but the three classes is a 400. */
function dataClassOf(request: Request): DataClass {
  const value = request.headers.get("x-yaatal-data-class");
  if (value === null) return "operational";
  const wanted = value.trim().toLowerCase();
  const found = DATA_CLASSES.find(dataClass => dataClass === wanted);
  if (!found) throw new HttpError(400, "invalid_data_class", "x-yaatal-data-class must be sovereign, operational or public.");
  return found;
}

async function readJson(
  request: Request,
  options: { emptyAsObject?: boolean } = {},
): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, "request_too_large", "Request body is too large.");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "request_too_large", "Request body is too large.");
  if (options.emptyAsObject && text.trim() === "") return {};
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
  const dataClass = dataClassOf(request);
  const body = await readJson(request);
  const offer = findModel(body.model, availableModels(env));
  if (!offer) throw new HttpError(404, "model_not_found", "Unknown model. GET /v1/models lists what is available.");
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new HttpError(400, "invalid_request", "messages must be a non-empty array.");
  }
  // Before the balance check and any upstream call: sovereign data never leaves controlled endpoints.
  if (!allowsDataClass(offer, dataClass)) {
    throw new HttpError(403, "data_class_not_allowed",
      `${offer.id} cannot process ${dataClass} data: not every upstream is a controlled endpoint. Nothing was sent.`);
  }
  if (account.balanceUxof <= 0) {
    await recordEvent(env.DB, account.id, "insufficient_balance", offer.id);
    throw new HttpError(402, "insufficient_balance", "This account has no balance left. Top up to continue.");
  }

  const upstreamBody = prepare(body, offer);
  const result = await callUpstreams(env, offer, upstreamBody, fetch, {
    firstOnly: request.headers.get("x-yaatal-no-failover") === "1",
  });
  if (!result) {
    await recordEvent(env.DB, account.id, "no_upstream", offer.id);
    throw new HttpError(503, "no_upstream", "No upstream is configured for this model.");
  }
  const { response, skipped } = result;
  const headers = new Headers({ "x-yaatal-model": offer.id });
  if (skipped) headers.set("x-yaatal-failover", String(skipped));

  // Upstream refused: pass its status on, uncharged.
  if (!response.ok) {
    await response.body?.cancel();
    await recordEvent(env.DB, account.id, "upstream_error", offer.id);
    // A refusal of the request itself is the client's to fix; retrying it, or another upstream, cannot help.
    if (response.status === 400 || response.status === 422) {
      return error(400, "invalid_request",
        `The model refused this request as invalid (upstream status ${response.status}). Check its messages and tools. You were not charged.`);
    }
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
    const stream = client.pipeThrough(publicModelIds(offer.id)).pipeThrough(separateToolCalls());
    return new Response(offer.thinksInContent ? stream.pipeThrough(thinkingOutOfStream()) : stream, { status: 200, headers });
  }

  const completion = (await response.json()) as Record<string, unknown>;
  const reported = usageFrom(completion);
  const counts = reported
    ? { ...reported, estimated: false }
    : { inputTokens: estimateTokens(inputCharacters), outputTokens: estimateTokens(generatedCharacters(completion)), estimated: true };
  await charge(env, account.id, offer, counts);
  return Response.json({ ...splitToolCalls(moveThinking(completion)), model: offer.id }, { headers });
}

/**
 * Rewrites every streamed chunk's `model` to the public id, so a stream never reveals which upstream
 * served it (non-streamed responses get the same treatment above). Lines that are not JSON events,
 * such as `data: [DONE]`, pass through untouched.
 */
export function publicModelIds(publicId: string): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  const rewrite = (line: string) => {
    if (!line.startsWith("data: {")) return line;
    try {
      const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
      if (typeof event.model === "string") event.model = publicId;
      return `data: ${JSON.stringify(event)}`;
    } catch {
      return line;
    }
  };
  return new TransformStream({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop()!;
      if (lines.length) controller.enqueue(encoder.encode(lines.map(rewrite).join("\n") + "\n"));
    },
    flush(controller) {
      pending += decoder.decode();
      if (pending) controller.enqueue(encoder.encode(rewrite(pending)));
    },
  });
}

/**
 * The body sent upstream: public id swapped for the upstream's, output capped, usage requested,
 * tool-call arguments in the history made valid JSON.
 */
function prepare(body: Record<string, unknown>, offer: ModelOffer): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  for (const field of STRIPPED_FIELDS) delete out[field];
  if (Array.isArray(out.messages)) out.messages = repairToolCalls(out.messages);
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
    costUxof: costOf(offer, counts.inputTokens, counts.outputTokens),
    estimated: counts.estimated,
  });
}

async function balance(request: Request, env: Env): Promise<Response> {
  const account = await authenticate(request, env);
  const rows = await recentLedger(env.DB, account.id);
  return Response.json({
    account: { id: account.id, name: account.name },
    balance_xof: account.balanceUxof / UXOF,
    recent: rows.map(row => ({
      kind: row.kind,
      amount_xof: Number(row.amount_uxof) / UXOF,
      model: row.model,
      input_tokens: row.input_tokens,
      output_tokens: row.output_tokens,
      estimated: row.estimated === 1,
      note: row.note,
      payment_ref: row.payment_ref,
      at: row.created_at,
    })),
  });
}

/**
 * The voice call runs in the yaatal-voice Worker. The landing page reaches it on its own origin:
 * the call's files under /voix/ (prefix removed) and its WebSocket under /agents/yaatal-voice/.
 */
function voiceRoute(request: Request, voice: Fetcher, url: URL): Promise<Response> {
  if (url.pathname.startsWith("/agents/")) return voice.fetch(request);
  const target = new URL(url);
  target.pathname = url.pathname.slice("/voix".length);
  return voice.fetch(new Request(target, request));
}

async function admin(request: Request, env: Env, path: string): Promise<Response> {
  const keysPath = /^\/admin\/accounts\/[^/]+\/keys$/.test(path);
  const isAdminToken = await isAdmin(request, env);
  // Only the mint-a-key route accepts the issuer token at all (the route-shape restriction).
  const asIssuer = !isAdminToken && keysPath ? await keyIssuerName(request, env) : null;
  // CREDIT_TOKEN reaches the credit route and nothing else.
  const asCredit =
    !isAdminToken && !asIssuer && /^\/admin\/accounts\/[^/]+\/credits$/.test(path) && (await bearerMatches(request, env.CREDIT_TOKEN));
  if (!isAdminToken && !asIssuer && !asCredit) throw new HttpError(401, "unauthorized", "Admin token required.");
  const body = await readJson(request);

  if (path === "/admin/accounts") {
    const name = text(body.name, "name");
    const issuer = body.issuer === undefined || body.issuer === null ? null : parseIssuer(body.issuer);
    const account = await createAccount(env.DB, name, issuer);
    const { id: keyId, key } = await createKey(env.DB, account.id, "default");
    const creditXof = body.credit_xof === undefined ? 0 : xof(body.credit_xof);
    const balanceUxof = creditXof ? (await credit(env.DB, account.id, creditXof * UXOF, "opening credit")).balanceUxof : 0;
    return Response.json(
      { account: { id: account.id, name, issuer }, api_key: key, key_id: keyId, balance_xof: balanceUxof / UXOF },
      { status: 201 },
    );
  }
  if (path === "/admin/keys/revoke") {
    return Response.json({ revoked: await revokeKey(env.DB, text(body.key, "key")) });
  }
  const match = /^\/admin\/accounts\/([0-9a-f-]{36})\/(keys|credits|issuer)$/.exec(path);
  if (match) {
    const [, accountId, action] = match as unknown as [string, string, string];
    if (action === "keys") {
      // An issuer token only reaches an account an admin assigned to it; everything else 404s,
      // same as an account that does not exist, so a leaked token learns nothing either way.
      if (asIssuer && (await accountIssuer(env.DB, accountId)) !== asIssuer) {
        throw new HttpError(404, "not_found", "No such account.");
      }
      const { id: keyId, key } = await createKey(env.DB, accountId, text(body.label, "label"));
      return Response.json({ key_id: keyId, api_key: key }, { status: 201 });
    }
    if (action === "credits") {
      const amount = xof(body.xof);
      // The settlement this credit pays for, when there is one. Admin-only route, so the reference
      // is the operator's or the payment bridge's to supply; a credit without one is never deduped.
      const paymentRef =
        body.payment_ref === undefined || body.payment_ref === null ? null : text(body.payment_ref, "payment_ref");
      if (asCredit && paymentRef === null) {
        throw new HttpError(400, "payment_ref_required", "payment_ref is required with this token.");
      }
      const { balanceUxof, applied } = await credit(env.DB, accountId, amount * UXOF, text(body.note, "note"), paymentRef);
      return Response.json({ balance_xof: balanceUxof / UXOF, applied });
    }
    // action === "issuer": not on the keys route, so this always required the admin token.
    if (!("issuer" in body)) throw new HttpError(400, "invalid_request", "issuer must be a string or null.");
    const issuer = body.issuer === null ? null : parseIssuer(body.issuer);
    if (!(await setAccountIssuer(env.DB, accountId, issuer))) throw new HttpError(404, "not_found", "No such account.");
    return Response.json({ issuer });
  }
  throw new HttpError(404, "not_found", "No such admin route.");
}

/** PUT /admin/accounts/by-pid/:pid -- idempotent: the gateway account for one Engine user. */
async function adminUpsertByPid(request: Request, env: Env, path: string): Promise<Response> {
  const isAdminToken = await isAdmin(request, env);
  const asIssuer = isAdminToken ? null : await keyIssuerName(request, env);
  if (!isAdminToken && !asIssuer) throw new HttpError(401, "unauthorized", "Admin token required.");
  const pid = enginePid(path.slice("/admin/accounts/by-pid/".length));
  const body = await readJson(request, { emptyAsObject: true });
  const name = body.name === undefined ? "Engine user" : displayName(body.name);
  const { account, created } = await upsertAccountByPid(env.DB, pid, name, asIssuer);
  // An issuer token only reaches its own accounts; another owner's answers 404, as on the keys route.
  // A free pid is created (200), so the upsert itself tells "taken" from "free": what keeps that from
  // being an oracle is that Engine pids are random UUIDv4s -- there is nothing to enumerate by guessing.
  if (asIssuer && account.issuer !== asIssuer) {
    throw new HttpError(404, "not_found", "No such account.");
  }
  return Response.json({ id: account.id, engine_pid: pid, created, balance_xof: account.balanceUxof / UXOF });
}

/** GET /admin/accounts/by-pid/:pid -- lets the settlement bridge find a buyer's account from their pid. */
async function adminGetByPid(request: Request, env: Env, path: string): Promise<Response> {
  if (!(await isAdmin(request, env)) && !(await bearerMatches(request, env.CREDIT_TOKEN))) {
    throw new HttpError(401, "unauthorized", "Admin token required.");
  }
  const pid = enginePid(path.slice("/admin/accounts/by-pid/".length));
  const account = await accountByPid(env.DB, pid);
  if (!account) throw new HttpError(404, "not_found", "No such account.");
  return Response.json({ id: account.id, engine_pid: pid, balance_xof: account.balanceUxof / UXOF });
}

async function adminDelete(request: Request, env: Env, path: string): Promise<Response> {
  const isAdminToken = await isAdmin(request, env);
  const asIssuer = isAdminToken ? null : await keyIssuerName(request, env);
  if (!isAdminToken && !asIssuer) throw new HttpError(401, "unauthorized", "Admin token required.");
  const match = /^\/admin\/keys\/([0-9a-f-]{36})$/.exec(path);
  if (match) {
    const [, keyId] = match as unknown as [string, string];
    // Same rule as minting: an issuer token only reaches keys on an account assigned to it.
    if (asIssuer && (await keyAccountIssuer(env.DB, keyId)) !== asIssuer) {
      throw new HttpError(404, "not_found", "No such key.");
    }
    return Response.json({ revoked: await revokeKeyById(env.DB, keyId) });
  }
  throw new HttpError(404, "not_found", "No such admin route.");
}

async function usageAdmin(request: Request, env: Env, url: URL): Promise<Response> {
  if (!(await isAdmin(request, env))) throw new HttpError(401, "unauthorized", "Admin token required.");
  const days = Number(url.searchParams.get("days") ?? "30");
  if (!Number.isInteger(days) || days < 1 || days > 366) {
    throw new HttpError(400, "invalid_request", "days must be a whole number from 1 to 366.");
  }
  return Response.json(await usageReport(env.DB, days), { headers: { "cache-control": "no-store" } });
}

async function isAdmin(request: Request, env: Env): Promise<boolean> {
  return bearerMatches(request, env.ADMIN_TOKEN);
}

/**
 * The key-issuer token's name, when this request's bearer matches KEY_ISSUER_TOKEN and
 * KEY_ISSUER_NAME is configured -- the accounts.issuer value the caller may act on. Unconfigured
 * never means open: without a name the token mints and revokes nothing, however it is presented.
 */
async function keyIssuerName(request: Request, env: Env): Promise<string | null> {
  if (!env.KEY_ISSUER_NAME) return null;
  return (await bearerMatches(request, env.KEY_ISSUER_TOKEN)) ? env.KEY_ISSUER_NAME : null;
}

async function bearerMatches(request: Request, expected: string | undefined): Promise<boolean> {
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An Engine user pid: a UUID, normalised to lowercase. */
function enginePid(value: string): string {
  if (!UUID.test(value)) throw new HttpError(400, "invalid_pid", "pid must be a UUID.");
  return value.toLowerCase();
}

function displayName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 80) {
    throw new HttpError(400, "invalid_request", "name must be 1 to 80 characters.");
  }
  return value.trim();
}

function xof(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 1_000_000_000) {
    throw new HttpError(400, "invalid_request", "xof must be a whole number of XOF (FCFA), 1 to 1,000,000,000.");
  }
  return value;
}

/** An issuer name: 1 to 32 lowercase letters, digits and hyphens, matched against KEY_ISSUER_NAME. */
function parseIssuer(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9-]{1,32}$/.test(value)) {
    throw new HttpError(400, "invalid_request", "issuer must be 1 to 32 lowercase letters, digits and hyphens.");
  }
  return value;
}

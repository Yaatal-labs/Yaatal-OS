import { costOf, type ModelOffer } from "./models.js";
import { reserveBooRun, settleBooRun, releaseBooRun, booRunByKey, booRunById } from "./ledger.js";
import { callUpstreams, type UpstreamEnv } from "./upstream.js";
import { usageFrom } from "./usage.js";
import { moveThinking, normalizeReasoning } from "./think.js";
import { repairToolCalls, splitToolCalls } from "./tool-calls.js";
import { prepare } from "./request-body.js";
import { availableModels } from "./models.js";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES = 32;
const MAX_OUTPUT_TOKENS = 512;
const IDEMPOTENCY_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const TOOL_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface BooRunEnv extends UpstreamEnv {
  DB: D1Database;
  BOO_MODEL_ID?: string;
  WORKERS_PAID?: string;
  /** Comma-separated function names the host is willing to execute. */
  BOO_ALLOWED_TOOLS?: string;
}

export interface BooAccount { id: string; balanceUxof: number; }

export async function handleBooCompletion(request: Request, env: BooRunEnv, account: BooAccount): Promise<Response> {
  const idem = request.headers.get("idempotency-key") ?? "";
  if (!IDEMPOTENCY_RE.test(idem)) return fail(400, "idempotency_key_required", "A valid Idempotency-Key is required.");

  const modelId = env.BOO_MODEL_ID?.trim();
  if (!modelId) return fail(503, "boo_disabled", "Boo inference is not configured.");
  const raw = await readBoundedBody(request);
  if (raw === null) return fail(413, "request_too_large", "Request body is too large.");
  if (raw === undefined) return fail(400, "invalid_request", "Request body is invalid.");
  let input: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    input = parsed as Record<string, unknown>;
  } catch { return fail(400, "invalid_json", "Request body must be a JSON object."); }

  if (input.model !== modelId) return fail(400, "model_not_allowed", "Boo runs accept only the configured model.");
  const messages = input.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES ||
      messages.some(message => !message || typeof message !== "object" || Array.isArray(message))) {
    return fail(400, "invalid_messages", "messages must contain between 1 and 32 message objects.");
  }
  const maxTokens = input.max_output_tokens ?? input.max_tokens ?? input.max_completion_tokens ?? MAX_OUTPUT_TOKENS;
  if (typeof maxTokens !== "number" || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > MAX_OUTPUT_TOKENS) {
    return fail(400, "output_limit_exceeded", `max_output_tokens must be between 1 and ${MAX_OUTPUT_TOKENS}.`);
  }
  const tools = validateTools(input.tools, env.BOO_ALLOWED_TOOLS);
  if (tools === null) return fail(400, "tools_not_allowed", "A requested tool is not enabled for Boo.");
  if (input.tool_choice !== undefined && input.tool_choice !== "auto" && input.tool_choice !== "none") {
    return fail(400, "invalid_tool_choice", "tool_choice must be auto or none.");
  }
  if (input.stream !== undefined && input.stream !== false) {
    return fail(400, "streaming_not_supported", "Boo completions must be non-streaming.");
  }
  const allowed = new Set(["model", "messages", "max_output_tokens", "max_tokens", "max_completion_tokens", "temperature", "top_p", "stop", "seed", "tools", "tool_choice", "parallel_tool_calls", "stream"]);
  if (Object.keys(input).some(key => !allowed.has(key))) return fail(400, "invalid_request", "Request contains unsupported fields.");

  const offer = findConfiguredOffer(modelId, env);
  if (!offer) return fail(503, "boo_disabled", "The configured Boo model is unavailable or is not in the micro tier.");
  // Hash the effective request with aliases/defaults collapsed and object keys sorted.
  // JSON.stringify(input) alone is order-sensitive and permits semantically identical retries
  // to conflict (or alternate spellings to bypass the intended canonical contract).
  const canonical = stableJson({
    model: modelId, messages, max_tokens: maxTokens,
    ...(tools ? { tools } : {}),
    ...(tools ? { tool_choice: input.tool_choice ?? "auto" } : {}),
    ...copySampling(input),
  });
  const hash = await sha256(canonical);
  const previous = await booRunByKey(env.DB, account.id, idem);
  if (previous) return replay(previous, hash);

  // One token per UTF-8 byte plus message framing is a deliberately conservative bound.
  const inputBound = new TextEncoder().encode(canonical).byteLength + messages.length * 16 + 128;
  const reservation = costOf(offer, inputBound, maxTokens);
  const runId = crypto.randomUUID();
  try {
    const reserved = await reserveBooRun(env.DB, {
      id: runId, accountId: account.id, idempotencyKey: idem, requestHash: hash,
      model: offer.id, amountUxof: reservation,
    });
    if (!reserved) {
      const raced = await booRunByKey(env.DB, account.id, idem);
      if (raced) return replay(raced, hash);
      return fail(402, "insufficient_balance", "Available balance cannot cover the maximum Boo call cost.");
    }
  } catch {
    const raced = await booRunByKey(env.DB, account.id, idem);
    if (raced) return replay(raced, hash);
    return fail(500, "reservation_failed", "Boo could not reserve the call balance.");
  }

  const body: Record<string, unknown> = {
    model: offer.id,
    messages: repairToolCalls(messages),
    max_tokens: maxTokens,
    stream: false,
    ...(tools ? { tools, tool_choice: input.tool_choice ?? "auto" } : {}),
    ...copySampling(input),
  };
  const upstreamBody = prepare(body, offer);
  let result: Awaited<ReturnType<typeof callUpstreams>>;
  try { result = await callUpstreams(env, offer, upstreamBody, fetch, { firstOnly: true }); }
  catch {
    await markUncertain(env.DB, runId);
    return uncertain(runId);
  }
  if (!result) {
    await releaseBooRun(env.DB, runId, "no_upstream");
    return fail(503, "no_upstream", "No upstream is configured for the Boo model.");
  }
  if (result.networkError) {
    await markUncertain(env.DB, runId);
    return uncertain(runId);
  }
  if (!result.response.ok) {
    const status = result.response.status;
    await result.response.body?.cancel();
    if (status >= 500) {
      await markUncertain(env.DB, runId);
      return uncertain(runId);
    }
    await releaseBooRun(env.DB, runId, "upstream_rejected");
    return fail(status === 429 ? 429 : status >= 500 ? 502 : 400, "upstream_rejected", "The Boo model rejected or could not serve this call; the reservation was released.");
  }
  try {
    const completionText = await readBoundedResponseText(result.response, 512 * 1024);
    const completion = JSON.parse(completionText) as Record<string, unknown>;
    if (!isCompletion(completion)) throw new Error("invalid completion shape");
    const usage = usageFrom(completion);
    if (usage === null) throw new Error("missing or invalid usage counts");
    const counts = usage;
    const actual = costOf(offer, counts.inputTokens, counts.outputTokens);
    if (actual > reservation) {
      await markUncertain(env.DB, runId);
      return uncertain(runId);
    }
    const responseBody = { ...splitToolCalls(normalizeReasoning(moveThinking(completion))), model: offer.id };
    await settleBooRun(env.DB, runId, {
      actualUxof: actual, inputTokens: counts.inputTokens, outputTokens: counts.outputTokens,
      estimated: !usage, completionJson: JSON.stringify(responseBody),
    });
    return Response.json(responseBody, { headers: { "x-yaatal-model": offer.id, "x-yaatal-boo-run-id": runId } });
  } catch {
    await markUncertain(env.DB, runId);
    return uncertain(runId);
  }
}

function isCompletion(value: Record<string, unknown>): boolean {
  if (typeof value.id !== "string" || value.id.length === 0 ||
      typeof value.model !== "string" || value.model.length === 0) return false;
  if (!Array.isArray(value.choices) || value.choices.length === 0) return false;
  return value.choices.every(choice => {
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) return false;
    const message = (choice as Record<string, unknown>).message;
    if (!message || typeof message !== "object" || Array.isArray(message)) return false;
    const body = message as Record<string, unknown>;
    return body.role === "assistant" &&
      (body.content === undefined || body.content === null || typeof body.content === "string") &&
      ((choice as Record<string, unknown>).finish_reason === undefined ||
        (choice as Record<string, unknown>).finish_reason === null ||
        typeof (choice as Record<string, unknown>).finish_reason === "string");
  });
}

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new Error("completion too large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("completion too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
}

export async function handleBooRunStatus(request: Request, env: BooRunEnv, account: BooAccount, id: string): Promise<Response> {
  const run = await booRunById(env.DB, account.id, id);
  if (!run) return fail(404, "not_found", "No such Boo run.");
  if (run.status === "settled" && run.completionJson) {
    return Response.json({ id: run.id, status: run.status, completion: JSON.parse(run.completionJson), billed_xof: (run.actualUxof ?? 0) / 1_000_000 });
  }
  return Response.json({ id: run.id, status: run.status, ...(run.errorCode ? { error: run.errorCode } : {}) }, { status: run.status === "reserved" || run.status === "uncertain" ? 202 : 200 });
}

function replay(run: Awaited<ReturnType<typeof booRunByKey>> & {}, hash: string): Response {
  if (run.requestHash !== hash) return fail(409, "idempotency_conflict", "This Idempotency-Key was already used with a different request.");
  if (run.status === "settled" && run.completionJson) {
    return Response.json(JSON.parse(run.completionJson), { headers: { "x-yaatal-model": run.model, "x-yaatal-boo-run-id": run.id, "idempotency-replayed": "true" } });
  }
  if (run.status === "failed") return fail(502, run.errorCode ?? "upstream_rejected", "The original Boo call failed; use a new Idempotency-Key to try again.");
  return uncertain(run.id);
}

function findConfiguredOffer(id: string, env: BooRunEnv): ModelOffer | null {
  // Avoid importing the public paid-plan filter: this lane still honors deployment availability.
  const offer = configuredModels(env).find(model => model.id === id);
  return offer?.tier === "micro" ? offer : null;
}

function configuredModels(env: BooRunEnv) { return availableModels(env); }

function validateTools(value: unknown, configured?: string): Record<string, unknown>[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 8) return null;
  const allowed = new Set((configured ?? "").split(",").map(name => name.trim()).filter(Boolean));
  if (value.length && allowed.size === 0) return null;
  const result: Record<string, unknown>[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const tool = item as Record<string, unknown>;
    if (tool.type !== "function" || !tool.function || typeof tool.function !== "object" || Array.isArray(tool.function)) return null;
    const fn = tool.function as Record<string, unknown>;
    if (typeof fn.name !== "string" || !TOOL_NAME_RE.test(fn.name) || !allowed.has(fn.name) ||
        typeof fn.parameters !== "object" || fn.parameters === null || Array.isArray(fn.parameters)) return null;
    result.push({ type: "function", function: { name: fn.name, ...(typeof fn.description === "string" ? { description: fn.description.slice(0, 512) } : {}), parameters: fn.parameters } });
  }
  return result;
}

function copySampling(input: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const key of ["temperature", "top_p", "stop", "seed", "parallel_tool_calls"] as const) {
    if (key in input) result[key] = input[key];
  }
  return result;
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
async function readBoundedBody(request: Request): Promise<string | null | undefined> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } catch { return undefined; }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes); } catch { return undefined; }
}
function fail(status: number, code: string, message: string) { return Response.json({ error: { type: code, code, message } }, { status }); }
function uncertain(id: string) { return Response.json({ id, status: "uncertain", status_url: `/v1/boo/runs/${id}` }, { status: 202, headers: { "x-yaatal-boo-run-id": id, "retry-after": "3" } }); }
async function markUncertain(db: D1Database, id: string) {
  await db.prepare("UPDATE boo_runs SET status = 'uncertain', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND status = 'reserved'").bind(id).run();
}

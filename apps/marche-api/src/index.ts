// Yaatal Marché catalogue API: apps published from Créer (the kairmel builder, a separate
// repo) go into a review queue here; the founder approves or rejects from /admin/*; Marché
// (apps/marche) serves only the approved ones from /v1/catalogue. The manifest format and its
// validator are apps/marche's own (src/manifest/) -- imported directly (src/manifest.ts) so a
// listing that validates here is exactly one Marché itself would accept.
//
// Marché itself (the built PWA, apps/marche/dist) is served from this same Worker via Workers
// Static Assets (see wrangler.jsonc's `assets`), so the session cookie below is first-party --
// no CORS, no cross-site cookie questions. Static files are matched before this Worker ever
// runs; only paths that don't match a file (everything below) reach `fetch`.
//
//   POST /v1/listings                  Bearer PUBLISH_TOKEN  {manifest, owner} -> create/replace
//   GET  /v1/listings/:id              Bearer PUBLISH_TOKEN  -> {id, status, reason?, updated_at}
//   GET  /v1/catalogue                 none                  -> {apps: [...]} (approved, by name)
//   GET  /admin/listings               Bearer ADMIN_TOKEN    ?status=pending|approved|rejected
//   POST /admin/listings/:id/approve   Bearer ADMIN_TOKEN
//   POST /admin/listings/:id/reject    Bearer ADMIN_TOKEN    {reason}
//
//   POST /v1/auth/whatsapp/start       none (session cookie) -> {id, whatsapp_url, expires_in_seconds}
//   GET  /v1/auth/whatsapp/status      none                  ?id= -> {status}
//   POST /v1/auth/whatsapp/verify      none                  {id, code} -> {signedIn:true}, sets the session cookie
//   POST /v1/auth/logout               session cookie        -> {signedIn:false}, clears the cookie
//   GET  /v1/me                        session cookie         -> {signedIn}
//   GET  /v1/me/identity               session cookie        ?app= -> {id} (per-app, never the pid)
//
// PUBLISH_TOKEN and ADMIN_TOKEN are independent: neither authenticates the other's routes. The
// WhatsApp sign-in routes are documented in full in README.md -- see there for the rate-limiting
// and CSRF design, and for ENGINE_API_URL/ENGINE_AUTH_SECRET/SESSION_SECRET/IDENTITY_SECRET.
import { validateAppManifest } from "./manifest.js";
import {
  OwnerMismatchError,
  approveListing,
  approvedCatalogue,
  getListing,
  listListings,
  publishListing,
  rejectListing,
  type ListingStatus,
} from "./listings.js";
import { clearSessionCookie, readSessionCookie, setSessionCookie } from "./auth/cookies.js";
import { deriveIdentity } from "./auth/identity.js";
import { EngineMisconfiguredError, EngineVerifyFailedError, engineStart, engineStatus, engineVerify } from "./auth/engine.js";
import { checkRateLimit } from "./auth/rate-limit.js";
import { createSession, deleteSession, getSession } from "./auth/sessions.js";

export interface Env {
  DB: D1Database;
  /** Bearer token Créer uses to publish and read its own listings. Unset refuses every /v1/listings call. */
  PUBLISH_TOKEN?: string;
  /** Bearer token for the review queue (/admin/*). Unset refuses every admin call. */
  ADMIN_TOKEN?: string;
  /** The Yaatal Engine's base URL, e.g. "https://engine.example" -- server-to-server only, never
   *  exposed to the browser. See src/auth/engine.ts. */
  ENGINE_API_URL?: string;
  /** Shared secret sent as `X-Engine-Auth-Secret` on `start` and `verify`. >= 32 characters. */
  ENGINE_AUTH_SECRET?: string;
  /** Keyed-hash key for session tokens (src/auth/sessions.ts). >= 32 characters. Rotating this
   *  force-expires every session -- it does NOT affect IDENTITY_SECRET's output. */
  SESSION_SECRET?: string;
  /** Keyed-hash key for per-app identity (src/auth/identity.ts). >= 32 characters. Deliberately
   *  a *different* secret from SESSION_SECRET -- see that field's comment. */
  IDENTITY_SECRET?: string;
}

const MAX_BODY_BYTES = 1_000_000;
const MAX_OWNER = 64;
const MAX_REASON = 2_000;
const STATUSES: ReadonlySet<string> = new Set(["pending", "approved", "rejected"]);
const MIN_SECRET_LENGTH = 32;

/** The Engine's nonce id and an app manifest id share the same shape: a short, URL-safe token. */
const ID_PATTERN = /^[A-Za-z0-9-]{1,32}$/;
const CODE_PATTERN = /^\d{6}$/;

// Opening a nonce costs the caller nothing and costs us one Engine call -- keep it tight.
const START_RATE_LIMIT = 5; // per IP, per 10-minute window
// A person can mistype a 6-digit code a couple of times; still bounded well under what it'd
// take to brute-force one (the Engine itself locks a nonce after 5 wrong codes regardless).
const VERIFY_RATE_LIMIT = 10; // per IP, per 10-minute window

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/v1/catalogue" && request.method === "GET") return await catalogue(env);
      if (url.pathname === "/v1/listings" && request.method === "POST") return await createListing(request, env);

      const listingMatch = /^\/v1\/listings\/([^/]+)$/.exec(url.pathname);
      if (listingMatch && request.method === "GET") return await readListing(request, env, listingMatch[1]!);

      if (url.pathname === "/admin/listings" && request.method === "GET") return await adminList(request, env, url);

      const approveMatch = /^\/admin\/listings\/([^/]+)\/approve$/.exec(url.pathname);
      if (approveMatch && request.method === "POST") return await adminApprove(request, env, approveMatch[1]!);

      const rejectMatch = /^\/admin\/listings\/([^/]+)\/reject$/.exec(url.pathname);
      if (rejectMatch && request.method === "POST") return await adminReject(request, env, rejectMatch[1]!);

      if (url.pathname === "/v1/auth/whatsapp/start" && request.method === "POST") return await authStart(request, env, url);
      if (url.pathname === "/v1/auth/whatsapp/status" && request.method === "GET") return await authStatus(env, url);
      if (url.pathname === "/v1/auth/whatsapp/verify" && request.method === "POST") return await authVerify(request, env, url);
      if (url.pathname === "/v1/auth/logout" && request.method === "POST") return await authLogout(request, env, url);
      if (url.pathname === "/v1/me" && request.method === "GET") return await meStatus(request, env);
      if (url.pathname === "/v1/me/identity" && request.method === "GET") return await meIdentity(request, env, url);

      return error(404, "not_found", "No such route.");
    } catch (err) {
      if (err instanceof HttpError) return error(err.status, err.type, err.message);
      console.error("marche-api error", err instanceof Error ? err.message : String(err));
      return error(500, "server_error", "The catalogue API failed.");
    }
  },
} satisfies ExportedHandler<Env>;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly type: string,
    message: string,
  ) {
    super(message);
  }
}

function error(status: number, type: string, message: string): Response {
  return Response.json({ error: { type, message } }, { status });
}

async function requirePublisher(request: Request, env: Env): Promise<void> {
  if (!(await bearerMatches(request, env.PUBLISH_TOKEN))) {
    throw new HttpError(401, "unauthorized", "A valid publish token is required.");
  }
}

async function requireAdmin(request: Request, env: Env): Promise<void> {
  if (!(await bearerMatches(request, env.ADMIN_TOKEN))) {
    throw new HttpError(401, "unauthorized", "Admin token required.");
  }
}

/** Tokens under 32 characters are never accepted, and an unconfigured token refuses every
 *  request -- it is never treated as "open". Digests are compared so the check takes the same
 *  time whatever is presented. */
async function bearerMatches(request: Request, expected: string | undefined): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  if (!expected || expected.length < 32 || !header.startsWith("Bearer ")) return false;
  const [a, b] = await Promise.all([digest(header.slice(7)), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
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

function invalidManifest(messages: string[]): Response {
  return Response.json({ error: { type: "invalid_manifest", messages } }, { status: 400 });
}

async function createListing(request: Request, env: Env): Promise<Response> {
  await requirePublisher(request, env);
  const body = await readJson(request);

  const ownerRaw = body.owner;
  const owner = typeof ownerRaw === "string" ? ownerRaw.trim() : "";
  if (!owner || owner.length > MAX_OWNER) {
    throw new HttpError(400, "invalid_request", `owner must be 1 to ${MAX_OWNER} characters.`);
  }

  const validated = validateAppManifest(body.manifest);
  if (!validated.ok) return invalidManifest(validated.errors);

  try {
    const published = await publishListing(env.DB, validated.manifest, owner);
    return Response.json({ id: published.id, status: published.status }, { status: published.created ? 201 : 200 });
  } catch (err) {
    if (err instanceof OwnerMismatchError) {
      return Response.json({ error: { type: "id_taken" } }, { status: 409 });
    }
    throw err;
  }
}

async function readListing(request: Request, env: Env, id: string): Promise<Response> {
  await requirePublisher(request, env);
  const listing = await getListing(env.DB, id);
  if (!listing) throw new HttpError(404, "not_found", "No such listing.");
  return Response.json({
    id: listing.id,
    status: listing.status,
    ...(listing.reason ? { reason: listing.reason } : {}),
    updated_at: listing.updatedAt,
  });
}

async function catalogue(env: Env): Promise<Response> {
  const apps = await approvedCatalogue(env.DB);
  return Response.json(
    { apps },
    { headers: { "cache-control": "public, max-age=60", "access-control-allow-origin": "*" } },
  );
}

function parseStatus(raw: string | null): ListingStatus | undefined {
  if (raw === null) return undefined;
  if (!STATUSES.has(raw)) throw new HttpError(400, "invalid_request", "status must be pending, approved or rejected.");
  return raw as ListingStatus;
}

async function adminList(request: Request, env: Env, url: URL): Promise<Response> {
  await requireAdmin(request, env);
  const status = parseStatus(url.searchParams.get("status"));
  const listings = await listListings(env.DB, status);
  return Response.json(
    {
      listings: listings.map((listing) => ({
        id: listing.id,
        owner: listing.owner,
        status: listing.status,
        ...(listing.reason ? { reason: listing.reason } : {}),
        updated_at: listing.updatedAt,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

async function adminApprove(request: Request, env: Env, id: string): Promise<Response> {
  await requireAdmin(request, env);
  const listing = await approveListing(env.DB, id);
  if (!listing) throw new HttpError(404, "not_found", "No such listing.");
  return Response.json({ id: listing.id, status: listing.status, updated_at: listing.updatedAt });
}

async function adminReject(request: Request, env: Env, id: string): Promise<Response> {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const reasonRaw = body.reason;
  const reason = typeof reasonRaw === "string" ? reasonRaw.trim() : "";
  if (!reason || reason.length > MAX_REASON) {
    throw new HttpError(400, "invalid_request", `reason is required to reject, 1 to ${MAX_REASON} characters.`);
  }
  const listing = await rejectListing(env.DB, id, reason);
  if (!listing) throw new HttpError(404, "not_found", "No such listing.");
  return Response.json({ id: listing.id, status: listing.status, reason: listing.reason, updated_at: listing.updatedAt });
}

// ---------------------------------------------------------------------------------------------
// WhatsApp sign-in (/v1/auth/*, /v1/me*)
//
// `start`/`status`/`verify` proxy the Engine's own three-call flow (src/auth/engine.ts) --
// nothing here talks to WhatsApp directly. `verify`'s only side effect on success is a new row
// in `sessions` and a `Set-Cookie`; everything downstream (`/v1/me`, `/v1/me/identity`, logout)
// reads that same cookie. See README.md for the full design writeup (rate limiting, CSRF, the
// two separate secrets).
// ---------------------------------------------------------------------------------------------

function requireEngineConfig(env: Env): { apiUrl: string; authSecret: string } {
  const apiUrl = env.ENGINE_API_URL;
  const authSecret = env.ENGINE_AUTH_SECRET;
  if (!apiUrl || !authSecret || authSecret.length < MIN_SECRET_LENGTH) {
    throw new HttpError(503, "not_configured", "WhatsApp sign-in is not configured.");
  }
  return { apiUrl, authSecret };
}

function requireSessionSecret(env: Env): string {
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new HttpError(503, "not_configured", "Sign-in is not configured.");
  }
  return secret;
}

function requireIdentitySecret(env: Env): string {
  const secret = env.IDENTITY_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new HttpError(503, "not_configured", "Identity is not configured.");
  }
  return secret;
}

/** Cloudflare always sets this at the edge; a request without it (only possible outside
 *  Cloudflare, e.g. some local test harnesses) shares a single fallback bucket rather than
 *  bypassing the limit entirely. */
function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

/**
 * CSRF defense for the state-changing auth POSTs. Two independent checks, both required:
 *  - `Content-Type: application/json` -- an HTML form can never set this (forms are limited to
 *    `application/x-www-form-urlencoded`, `multipart/form-data` or `text/plain`), so a classic
 *    cross-site form POST can't satisfy it.
 *  - `Origin` must equal this Worker's own origin -- every modern browser sends `Origin` on a
 *    same-origin POST made with `fetch`, which is the only way anything ever calls these routes
 *    (see apps/marche/src/host/auth-client.ts); a request missing it, or carrying someone else's
 *    origin, is refused rather than treated as same-origin by default.
 * No CORS headers are ever sent on these routes (unlike /v1/catalogue) -- they are strictly
 * same-origin, which is what makes the cookie safe to be `SameSite=Lax` instead of `Strict`.
 */
function requireJsonAndOwnOrigin(request: Request, url: URL): void {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "invalid_content_type", "Content-Type must be application/json.");
  }
  const origin = request.headers.get("origin");
  if (!origin || origin !== url.origin) {
    throw new HttpError(403, "invalid_origin", "This request's Origin does not match.");
  }
}

async function authStart(request: Request, env: Env, url: URL): Promise<Response> {
  requireJsonAndOwnOrigin(request, url);
  const { apiUrl, authSecret } = requireEngineConfig(env);
  const allowed = await checkRateLimit(env.DB, "start", clientIp(request), START_RATE_LIMIT);
  if (!allowed) throw new HttpError(429, "rate_limited", "Too many attempts. Try again shortly.");

  try {
    const started = await engineStart(apiUrl, authSecret);
    return Response.json({
      id: started.id,
      whatsapp_url: started.whatsappUrl,
      expires_in_seconds: started.expiresInSeconds,
    });
  } catch (err) {
    if (err instanceof EngineMisconfiguredError) {
      // The Engine's 401 here means *our* secret is wrong, not anything the visitor did --
      // never pass an Engine 401 through as our own 401 for this route.
      throw new HttpError(503, "not_configured", "WhatsApp sign-in is misconfigured.");
    }
    throw new HttpError(502, "engine_unavailable", "Could not start WhatsApp sign-in.");
  }
}

async function authStatus(env: Env, url: URL): Promise<Response> {
  const { apiUrl } = requireEngineConfig(env);
  const id = url.searchParams.get("id") ?? "";
  if (!ID_PATTERN.test(id)) throw new HttpError(400, "invalid_request", "id is invalid.");

  try {
    const status = await engineStatus(apiUrl, id);
    return Response.json({ status }, { headers: { "cache-control": "no-store" } });
  } catch {
    throw new HttpError(502, "engine_unavailable", "Could not check WhatsApp sign-in status.");
  }
}

async function authVerify(request: Request, env: Env, url: URL): Promise<Response> {
  requireJsonAndOwnOrigin(request, url);
  const { apiUrl, authSecret } = requireEngineConfig(env);
  const sessionSecret = requireSessionSecret(env);

  const body = await readJson(request);
  const id = typeof body.id === "string" ? body.id : "";
  const code = typeof body.code === "string" ? body.code : "";
  if (!ID_PATTERN.test(id) || !CODE_PATTERN.test(code)) {
    throw new HttpError(400, "invalid_request", "id or code is invalid.");
  }

  const allowed = await checkRateLimit(env.DB, "verify", clientIp(request), VERIFY_RATE_LIMIT);
  if (!allowed) throw new HttpError(429, "rate_limited", "Too many attempts. Try again shortly.");

  let pid: string;
  try {
    pid = await engineVerify(apiUrl, authSecret, id, code);
  } catch (err) {
    if (err instanceof EngineVerifyFailedError) {
      throw new HttpError(401, "invalid_code", "That code did not work.");
    }
    throw new HttpError(502, "engine_unavailable", "Could not verify WhatsApp sign-in.");
  }

  const session = await createSession(env.DB, sessionSecret, pid);
  return Response.json(
    { signedIn: true },
    { headers: { "set-cookie": setSessionCookie(session.token), "cache-control": "no-store" } },
  );
}

async function authLogout(request: Request, env: Env, url: URL): Promise<Response> {
  requireJsonAndOwnOrigin(request, url);
  const sessionSecret = requireSessionSecret(env);
  const token = readSessionCookie(request);
  if (token) await deleteSession(env.DB, sessionSecret, token);
  return Response.json({ signedIn: false }, { headers: { "set-cookie": clearSessionCookie(), "cache-control": "no-store" } });
}

async function meStatus(request: Request, env: Env): Promise<Response> {
  const sessionSecret = requireSessionSecret(env);
  const token = readSessionCookie(request);
  const session = token ? await getSession(env.DB, sessionSecret, token) : null;
  return Response.json({ signedIn: session !== null }, { headers: { "cache-control": "no-store" } });
}

async function meIdentity(request: Request, env: Env, url: URL): Promise<Response> {
  const sessionSecret = requireSessionSecret(env);
  const identitySecret = requireIdentitySecret(env);
  const appId = url.searchParams.get("app") ?? "";
  if (!ID_PATTERN.test(appId)) throw new HttpError(400, "invalid_request", "app is invalid.");

  const token = readSessionCookie(request);
  const session = token ? await getSession(env.DB, sessionSecret, token) : null;
  if (!session) throw new HttpError(401, "not_signed_in", "Sign in first.");

  const id = await deriveIdentity(identitySecret, session.pid, appId);
  return Response.json({ id }, { headers: { "cache-control": "no-store" } });
}

// Yaatal Marché catalogue API: apps published from Créer (the kairmel builder, a separate
// repo) go into a review queue here; the founder approves or rejects from /admin/*; Marché
// (apps/marche) serves only the approved ones from /v1/catalogue. The manifest format and its
// validator are apps/marche's own (src/manifest/) -- imported directly (src/manifest.ts) so a
// listing that validates here is exactly one Marché itself would accept.
//
//   POST /v1/listings                  Bearer PUBLISH_TOKEN  {manifest, owner} -> create/replace
//   GET  /v1/listings/:id              Bearer PUBLISH_TOKEN  -> {id, status, reason?, updated_at}
//   GET  /v1/catalogue                 none                  -> {apps: [...]} (approved, by name)
//   GET  /admin/listings               Bearer ADMIN_TOKEN    ?status=pending|approved|rejected
//   POST /admin/listings/:id/approve   Bearer ADMIN_TOKEN
//   POST /admin/listings/:id/reject    Bearer ADMIN_TOKEN    {reason}
//
// PUBLISH_TOKEN and ADMIN_TOKEN are independent: neither authenticates the other's routes.
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

export interface Env {
  DB: D1Database;
  /** Bearer token Créer uses to publish and read its own listings. Unset refuses every /v1/listings call. */
  PUBLISH_TOKEN?: string;
  /** Bearer token for the review queue (/admin/*). Unset refuses every admin call. */
  ADMIN_TOKEN?: string;
}

const MAX_BODY_BYTES = 1_000_000;
const MAX_OWNER = 64;
const MAX_REASON = 2_000;
const STATUSES: ReadonlySet<string> = new Set(["pending", "approved", "rejected"]);

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

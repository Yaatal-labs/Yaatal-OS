# Marché catalogue API

The backend for Marché's catalogue (`apps/marche`): apps published from Créer (Kairmel's app
builder) land in a review queue here; the founder approves or rejects them from `/admin/*`;
Marché serves only the approved ones from `GET /v1/catalogue`. It also serves Marché itself
(`apps/marche`'s built PWA), same-origin, and is where a person signs in with WhatsApp so a
mini-app can get a real, per-app identity instead of the old per-device placeholder -- see
"Same-origin hosting" and "WhatsApp sign-in" below.

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /v1/listings` | `PUBLISH_TOKEN` | `{manifest, owner}` → create a listing, or replace it (same owner) → `{id, status: "pending"}` |
| `GET /v1/listings/:id` | `PUBLISH_TOKEN` | `{id, status, reason?, updated_at}` |
| `GET /v1/catalogue` | none | `{apps: [...]}` — approved listings only, sorted by name |
| `GET /admin/listings?status=` | `ADMIN_TOKEN` | the review queue, optionally filtered by `pending`/`approved`/`rejected` |
| `POST /admin/listings/:id/approve` | `ADMIN_TOKEN` | → `{id, status: "approved", updated_at}` |
| `POST /admin/listings/:id/reject` | `ADMIN_TOKEN` | `{reason}` (required, French) → `{id, status: "rejected", reason, updated_at}` |
| `POST /v1/auth/whatsapp/start` | none | → `{id, whatsapp_url, expires_in_seconds}` |
| `GET /v1/auth/whatsapp/status?id=` | none | → `{status: "pending"\|"code_sent"\|"expired"}` |
| `POST /v1/auth/whatsapp/verify` | none | `{id, code}` → `{signedIn: true}`, sets the session cookie |
| `POST /v1/auth/logout` | session cookie | → `{signedIn: false}`, clears the cookie |
| `GET /v1/me` | session cookie | → `{signedIn}` |
| `GET /v1/me/identity?app=` | session cookie | → `{id}` — a per-app id, never the Engine's `pid` |

`PUBLISH_TOKEN` and `ADMIN_TOKEN` are independent bearer tokens: neither authenticates the
other's routes, both must be at least 32 characters, and an unset token refuses every request it
would gate -- it is never treated as open. Same constant-time comparison (`SHA-256` digests) as
`apps/token-gateway`. The WhatsApp sign-in routes follow the same "unset → 503, never open" rule
for their own secrets (`ENGINE_API_URL`, `ENGINE_AUTH_SECRET`, `SESSION_SECRET`,
`IDENTITY_SECRET` -- see below).

## Same-origin hosting

`wrangler.jsonc`'s `assets.directory` points at `../marche/dist` (apps/marche's build output),
so this one Worker serves both the static PWA and this API, on the same origin. A request that
matches a built file (`index.html`, `assets/*`, `kairmel-bridge.js`, ...) is served directly by
Workers Static Assets, without this Worker's `fetch` running at all; `/v1/*` and `/admin/*` never
match a file, so they always reach it. This is why the session cookie below can be `SameSite=Lax`
and strictly first-party: there is no second origin to worry about. Build `apps/marche` first
(`pnpm build` there) so `dist/` exists before `wrangler dev`/deploy here.

## WhatsApp sign-in

Replaces the old per-device placeholder identity (`apps/marche`'s `deriveAppUserId`) with a real
account, via the Yaatal Engine's partner WhatsApp sign-in (private, Rust; server-to-server only
-- this Worker never talks to WhatsApp and never learns a phone number). The flow:

1. `POST /v1/auth/whatsapp/start` opens a nonce with the Engine (`X-Engine-Auth-Secret`) and
   returns a `wa.me` link and the nonce id. The person opens the link and sends `LOGIN-{id}`.
2. The Engine's own WhatsApp webhook replies with a 6-digit code; `GET
   /v1/auth/whatsapp/status?id=` lets the UI know once that's happened (`code_sent`).
3. `POST /v1/auth/whatsapp/verify {id, code}` checks the code with the Engine
   (`X-Engine-Auth-Secret`) and gets back a stable Engine user id (`pid` -- never a phone
   number). On success this Worker creates a session and sets the cookie; **the `pid` itself is
   never sent to the browser.**
4. Every later request (`/v1/me`, `/v1/me/identity`, logout) reads that cookie.

### Two secrets, on purpose

- `SESSION_SECRET` -- the key for `HMAC-SHA256(SESSION_SECRET, token)`, which is what's actually
  stored in `sessions.id` (`src/auth/sessions.ts`). The cookie holds the raw, high-entropy
  `token`; only its keyed hash ever touches D1, so a leaked table alone can't be used to sign in
  as anyone.
- `IDENTITY_SECRET` -- the key for the per-app id `GET /v1/me/identity` returns
  (`src/auth/identity.ts`): `hex HMAC-SHA256(IDENTITY_SECRET, "<pid>:<appId>")`.

These are deliberately *not* the same secret. Rotating `SESSION_SECRET` (e.g. to force-expire
every session after an incident) must never also silently change every mini-app's "stable"
per-app id -- that's the entire point apps/marche's README makes about `identity()` being stable.
Two secrets means the two concerns rotate independently.

### Rate limiting: a D1 table, not the Rate Limiting binding

`POST /v1/auth/whatsapp/start` and `POST /v1/auth/whatsapp/verify` are rate-limited per IP
(`CF-Connecting-IP`), 5 and 10 attempts per 10-minute window respectively (`src/auth/rate-limit.ts`).
This uses a small D1 table (a fixed-window counter keyed by `route:ip:windowStart`) rather than
the Workers Rate Limiting binding:

- This Worker already depends on D1 for everything else -- a table needs no new binding and no
  separate production-only setup.
- It's fully exercised by `@cloudflare/vitest-pool-workers`'s local D1 in `test/auth.test.ts`.
  The Rate Limiting binding has no local simulation there, so it would be the one piece of this
  feature untested in CI.

Tradeoff: old counter rows accumulate instead of expiring on their own (one row per bucket per
10-minute window) -- fine at Marché's current scale; a scheduled cleanup is a fair follow-up if
this table ever grows large enough to matter.

### CSRF

`POST /v1/auth/whatsapp/start`, `/verify` and `/v1/auth/logout` all require **both**:

- `Content-Type: application/json` -- an HTML form cannot set this (forms are limited to
  `application/x-www-form-urlencoded`, `multipart/form-data` or `text/plain`), so a classic
  cross-site form POST can never satisfy it.
- `Origin` equal to this Worker's own origin -- required and checked exactly, not just allowed
  when present. Every modern browser sends `Origin` on a same-origin `fetch` POST, which is the
  only way these routes are ever called (`apps/marche/src/host/auth-client.ts`).

No CORS headers are ever sent on the auth/`me` routes (unlike `GET /v1/catalogue`, which is
meant to be fetched cross-origin) -- they are strictly same-origin.

### The session cookie

`__Host-marche_session`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 30-day `Max-Age`. The
`__Host-` prefix makes every browser refuse to set it without `Secure` + `Path=/` + no `Domain`
-- the browser itself enforces it can only ever come from, and be sent back to, this exact
origin. `Secure` cookies are allowed over plain `http://localhost` in every current browser
(treated as a secure context), so this works unmodified under `wrangler dev`.

## Publishing semantics

- A new `manifest.id` is inserted as `pending`.
- The same `id` published again by the **same** `owner` replaces the stored manifest and puts it
  back to `pending`, whatever it was before (`200`).
- The same `id` published by a **different** `owner` is refused: `409 {error: {type: "id_taken"}}`.
  Nothing is changed.
- The manifest is validated with the exact same validator Marché itself uses
  (`apps/marche/src/manifest/validate.ts`, re-exported by `src/manifest.ts`) — a listing that
  passes here is guaranteed to be one Marché would accept and show.

## Run locally

```sh
pnpm install
printf 'PUBLISH_TOKEN=%s\nADMIN_TOKEN=%s\nSESSION_SECRET=%s\nIDENTITY_SECRET=%s\n' \
  "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" > .dev.vars
# WhatsApp sign-in also needs a real Engine to talk to -- add these two to try it end to end:
#   ENGINE_API_URL=https://engine.example
#   ENGINE_AUTH_SECRET=...
(cd ../marche && pnpm build)        # dist/ has to exist before this Worker's assets can serve it
pnpm dev                            # applies migrations to a local D1, serves the PWA + API on :8787
pnpm check && pnpm test             # types, and the tests in workerd with a local D1 (no secrets needed)
```

Without `ENGINE_API_URL`/`ENGINE_AUTH_SECRET` set, the catalogue and admin routes work exactly as
before; the WhatsApp sign-in routes 503 rather than doing anything (see "unset → 503" above) --
`pnpm test` exercises that path with a mocked Engine, so it never needs a real one.

To develop `apps/marche` standalone instead (its own `pnpm dev`, not served from here), point it
at a running instance of this Worker with `VITE_CATALOGUE_URL=http://localhost:8787 pnpm dev` --
its Vite dev server also proxies `/v1/*` to `http://localhost:8787` by default, so the sign-in
flow works there too. See `apps/marche/README.md`.

## What's deliberately not here

- **No payments, no auth beyond the tokens/secrets above.** Créer and the founder's own tooling
  are the only two callers of `/v1/listings`/`/admin/*`; there is no per-app-author login.
- **No deploy.** `database_id` in `wrangler.jsonc` is a placeholder; a real deployment supplies
  its own D1 database and its own secrets (`wrangler secret put`), including the WhatsApp
  sign-in ones above -- and its own Engine URL, never a real one committed here.
- **No scheduled cleanup of expired sessions or old rate-limit windows.** Both are inert once
  stale (an expired session is already treated as signed-out; an old rate-limit bucket just sits
  unused) -- fine to add if either table's size ever becomes a concern.

# Marché catalogue API

The backend for Marché's catalogue (`apps/marche`): apps published from Créer (Kairmel's app
builder) land in a review queue here; the founder approves or rejects them from `/admin/*`;
Marché serves only the approved ones from `GET /v1/catalogue`.

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /v1/listings` | `PUBLISH_TOKEN` | `{manifest, owner}` → create a listing, or replace it (same owner) → `{id, status: "pending"}` |
| `GET /v1/listings/:id` | `PUBLISH_TOKEN` | `{id, status, reason?, updated_at}` |
| `GET /v1/catalogue` | none | `{apps: [...]}` — approved listings only, sorted by name |
| `GET /admin/listings?status=` | `ADMIN_TOKEN` | the review queue, optionally filtered by `pending`/`approved`/`rejected` |
| `POST /admin/listings/:id/approve` | `ADMIN_TOKEN` | → `{id, status: "approved", updated_at}` |
| `POST /admin/listings/:id/reject` | `ADMIN_TOKEN` | `{reason}` (required, French) → `{id, status: "rejected", reason, updated_at}` |

`PUBLISH_TOKEN` and `ADMIN_TOKEN` are independent bearer tokens: neither authenticates the
other's routes, both must be at least 32 characters, and an unset token refuses every request it
would gate -- it is never treated as open. Same constant-time comparison (`SHA-256` digests) as
`apps/token-gateway`.

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
printf 'PUBLISH_TOKEN=%s\nADMIN_TOKEN=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" > .dev.vars
pnpm dev                    # applies migrations to a local D1, serves :8787
pnpm check && pnpm test     # types, and the tests in workerd with a local D1 (no tokens needed)
```

To try it against a running `apps/marche` dev server, build Marché with
`VITE_CATALOGUE_URL=http://localhost:8787 pnpm build` (or `pnpm dev` with that env var set) --
see `apps/marche/README.md`.

## What's deliberately not here

- **No payments, no auth beyond the two bearer tokens above.** Créer and the founder's own
  tooling are the only two callers; there is no per-app-author login.
- **No deploy.** `database_id` in `wrangler.jsonc` is a placeholder; a real deployment supplies
  its own D1 database and its own `PUBLISH_TOKEN`/`ADMIN_TOKEN` (`wrangler secret put`).
